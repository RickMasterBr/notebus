/**
 * O componente do mapa no Início (E-07 7b Bloco 4, D-096, D-108, D-110, D-179).
 * Fica atrás de tudo na tela do Início.
 * Todo import do @maplibre/maplibre-react-native fica neste arquivo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  UserLocation,
  type CameraRef,
  type GeoJSONSourceRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import { usePositionPermission, usePositionStore } from "../data/PositionProvider";
import { usePlaces } from "../data/PlacesProvider";
import { useTestClock } from "../data/TestClockProvider";
import { useNow } from "../data/NowProvider";
import { useToast } from "../data/ToastProvider";
import { useStopLocations } from "../data/StopLocationsProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { useRegistro } from "../data/RegistroProvider";
import { realNow } from "../data/clock";
import { waitForPositionFix } from "../data/mapLocate";
import { buildMapPoints, collectStopsWithRecords } from "../data/mapPoints";
import {
  canStartMapOpening,
  createMapStarter,
  findCasaPoint,
  MAP_START_PLACES_WAIT_MS,
  MAP_STYLE_DARK,
  MAP_STYLE_LIGHT,
} from "../data/mapStart";
import type { PermissionState } from "../data/devicePosition";
import { getSharedDb } from "../db/sharedDb";
import { readLastMapPosition, writeLastMapPosition } from "../db/appState";
import { t } from "../i18n";
import { useSheets } from "../sheets/SheetsContext";
import { useReduceMotion } from "../sheets/useReduceMotion";
import { elevation, minTouch, radius, space, useTheme } from "../theme";
import { TargetGlyph } from "../ui/Glyphs";
import type { MapOpening } from "@notebus/domain";

/** A faixa vermelha cobre 28 pt no topo (mais safe area). */
const BANNER_BAND = 28;

/** Recuo inferior da câmera para a folha do Início (HomeSheet, 40% da tela conforme D-150 / bloco 5). */
const HOME_SHEET_CAMERA_INSET_RATIO = 0.4;

/** Recuo inferior da câmera para a folha do Ponto (StopSheet, limite de 40% em SMALL_MAX_SHARE). */
const STOP_SHEET_CAMERA_INSET_RATIO = 0.4;

export function MapBackdrop() {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { state, dispatch } = useSheets();
  const { chosen } = useTestClock();
  const now = useNow();
  const toast = useToast();
  const store = usePositionStore();
  const permission = usePositionPermission();
  const places = usePlaces();
  const stopLocations = useStopLocations();
  const stopIndex = useStopIndex();
  const { observations } = useRegistro();
  const reduceMotion = useReduceMotion();

  const homeSheetInset = Math.round(window.height * HOME_SHEET_CAMERA_INSET_RATIO);
  const stopSheetInset = Math.round(window.height * STOP_SHEET_CAMERA_INSET_RATIO);

  const cameraRef = useRef<CameraRef>(null);
  const geoJsonSourceRef = useRef<GeoJSONSourceRef>(null);
  const [opening, setOpening] = useState<MapOpening | null>(null);
  const [failed, setFailed] = useState(false);

  const names = useMemo(() => {
    const map = new globalThis.Map<string, string>();
    if (stopIndex.status === "ready") {
      for (const s of stopIndex.stops) {
        map.set(s.id, s.name);
      }
    }
    return map;
  }, [stopIndex]);

  const stopsWithRecords = useMemo(
    () => collectStopsWithRecords(observations),
    [observations],
  );

  const pointsGeoJSON = useMemo(() => {
    return buildMapPoints({
      locations: stopLocations.stops,
      names,
      stopsWithRecords,
    });
  }, [stopLocations.stops, names, stopsWithRecords]);

  const bannerOffset = chosen === null ? 0 : BANNER_BAND;
  const covered = state.stack.length > 1;

  const [placesTimedOut, setPlacesTimedOut] = useState(false);

  useEffect(() => {
    if (places.status === "ready") return;
    const timer = setTimeout(() => {
      setPlacesTimedOut(true);
    }, MAP_START_PLACES_WAIT_MS);
    return () => clearTimeout(timer);
  }, [places.status]);

  const canStart = canStartMapOpening({
    placesStatus: places.status,
    elapsedMs: placesTimedOut ? MAP_START_PLACES_WAIT_MS : 0,
  });

  // Decide uma vez na abertura o centro inicial do mapa
  useEffect(() => {
    if (!canStart || opening !== null) return;
    let alive = true;
    void (async () => {
      const db = getSharedDb();
      const lastMapPosition = db ? await readLastMapPosition(db) : null;
      const home = places.status === "ready" ? findCasaPoint(places.places) : null;

      const starter = createMapStarter({
        permission: store.getPermission(),
        getFix: () => store.getFix(),
        subscribeFix: (listener) => store.subscribe(listener),
        home,
        lastMapPosition,
        nowMs: realNow(),
      });

      const decided = await starter.resolve();
      if (alive) {
        setOpening(decided);
      }
    })();

    return () => {
      alive = false;
    };
  }, [canStart, opening, places.status, places.places, store]);

  // Se falhou (sem mapa), tenta de novo só quando volta para a frente ou muda o tema
  useEffect(() => {
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active") setFailed(false);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setFailed(false);
  }, [theme.name]);

  const lastSavedRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentZoomRef = useRef<number>(14);

  const handleRegionDidChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (typeof e.nativeEvent?.zoom === "number") {
      currentZoomRef.current = e.nativeEvent.zoom;
    }
    const center = e.nativeEvent?.center;
    if (!center || !Array.isArray(center) || center.length < 2) return;
    const [lon, lat] = center;
    const point = { lat, lon };

    const currentNow = now();
    const timeSinceLast = currentNow - lastSavedRef.current;

    if (timeSinceLast >= 1000) {
      lastSavedRef.current = currentNow;
      const db = getSharedDb();
      if (db) void writeLastMapPosition(db, point, currentNow);
    } else {
      if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        lastSavedRef.current = now();
        const db = getSharedDb();
        if (db) void writeLastMapPosition(db, point, lastSavedRef.current);
      }, 1000 - timeSinceLast);
    }
  }, [now]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Ao tocar no botão "onde estou" (Item 5)
  const handleLocate = useCallback(async () => {
    let currentPerm = store.getPermission();

    if (currentPerm === "undetermined") {
      const permPromise = new Promise<PermissionState>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const unsub = store.subscribe(() => {
          const next = store.getPermission();
          if (next !== "undetermined") {
            unsub();
            if (timer) clearTimeout(timer);
            resolve(next);
          }
        });
        timer = setTimeout(() => {
          unsub();
          resolve(store.getPermission());
        }, 10_000);
      });
      store.askOnce();
      currentPerm = await permPromise;
    }

    if (currentPerm === "denied") {
      toast.show({ title: t("map.permission_denied") });
      return;
    }

    if (currentPerm === "granted") {
      let fix = store.getFix();
      if (!fix) {
        fix = await waitForPositionFix({
          getFix: () => store.getFix(),
          subscribeFix: (fn) => store.subscribe(fn),
          warm: () => store.warm(),
        });
      }

      if (!fix) {
        toast.show({ title: t("map.no_fix") });
        void store.warm();
        return;
      }

      cameraRef.current?.flyTo({
        center: [fix.lon, fix.lat],
        zoom: 16,
        padding: { bottom: homeSheetInset },
        duration: reduceMotion ? 0 : 1200,
      });
      void store.warm();
    }
  }, [store, toast, reduceMotion, homeSheetInset]);

  // Ao tocar num ponto ou grupo no mapa (Item 3)
  const handleSourcePress = useCallback(
    async (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = e.nativeEvent?.features?.[0];
      if (!feature) return;

      // 1. Grupo (cluster): centraliza com o zoom de expansão sem abrir folha
      if (feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id as number;
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        if (!coords || coords.length < 2) return;
        const lon = coords[0];
        const lat = coords[1];
        if (typeof lon !== "number" || typeof lat !== "number") return;

        let nextZoom: number | null = null;
        try {
          if (geoJsonSourceRef.current) {
            nextZoom = await geoJsonSourceRef.current.getClusterExpansionZoom(clusterId);
          }
        } catch {
          // Fallback se a API nativa falhar
        }

        const targetZoom =
          typeof nextZoom === "number" && !Number.isNaN(nextZoom)
            ? nextZoom
            : Math.min(16, currentZoomRef.current + 2);

        cameraRef.current?.flyTo({
          center: [lon, lat],
          zoom: targetZoom,
          duration: reduceMotion ? 0 : 600,
        });
        return;
      }

      // 2. Ponto solto: abre a folha do ponto e centraliza a câmera nele
      const stopId = feature.properties?.id;
      const name = feature.properties?.name ?? "";
      if (!stopId) return;

      const top = state.stack[state.stack.length - 1];

      // Só age se a pilha é só a folha inicial, ou se a folha do topo é um ponto (kind: "stop")
      if (state.stack.length > 1 && top?.kind !== "stop") {
        return;
      }

      // Tocar no mesmo ponto cuja folha já está aberta não faz nada
      if (top?.kind === "stop" && top.stopId === stopId) {
        return;
      }

      const coords = (feature.geometry as GeoJSON.Point).coordinates;
      if (!coords || coords.length < 2) return;
      const lon = coords[0];
      const lat = coords[1];
      if (typeof lon !== "number" || typeof lat !== "number") return;

      cameraRef.current?.flyTo({
        center: [lon, lat],
        padding: { bottom: stopSheetInset },
        duration: reduceMotion ? 0 : 800,
      });

      if (top?.kind === "stop") {
        dispatch({ type: "replace", sheet: { kind: "stop", stopId, name } });
      } else {
        dispatch({ type: "push", sheet: { kind: "stop", stopId, name } });
      }
    },
    [state.stack, dispatch, reduceMotion, stopSheetInset],
  );

  if (failed || opening === null) {
    return null;
  }

  const mapStyleUrl = theme.name === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* O mapa fica atrás e fora do VoiceOver (plano: não navegável por toque) */}
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyleUrl}
          attribution={true}
          attributionPosition={{
            top: insets.top + space.sm + bannerOffset,
            left: space.md,
          }}
          logo={false}
          onDidFailLoadingMap={() => setFailed(true)}
          onRegionDidChange={handleRegionDidChange}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: [opening.point.lon, opening.point.lat],
              zoom: 14,
              padding: { bottom: homeSheetInset },
            }}
            maxZoom={16}
          />
          <GeoJSONSource
            id="stop-points"
            ref={geoJsonSourceRef}
            data={pointsGeoJSON}
            cluster={true}
            clusterRadius={50}
            clusterMaxZoom={13}
            onPress={handleSourcePress}
          >
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": colors.accent,
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  16,
                  10,
                  22,
                  50,
                  28,
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": theme.name === "dark" ? colors.surface : "#FFFFFF",
              }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-font": ["Noto Sans Regular"],
                "text-size": 12,
              }}
              paint={{
                "text-color": colors.onAccent,
              }}
            />
            <Layer
              id="unclustered-points"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-radius": 8,
                "circle-color": [
                  "case",
                  ["get", "filled"],
                  colors.accent,
                  "transparent",
                ],
                "circle-stroke-color": [
                  "case",
                  ["get", "filled"],
                  theme.name === "dark" ? colors.surface : "#FFFFFF",
                  colors.accent,
                ],
                "circle-stroke-width": [
                  "case",
                  ["get", "filled"],
                  1.5,
                  3,
                ],
              }}
            />
          </GeoJSONSource>
          {permission === "granted" ? <UserLocation /> : null}
        </Map>
      </View>

      {/* Botão 'onde estou' (Item 5), abaixo da engrenagem na mesma coluna */}
      {!covered && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("map.locate.a11y")}
          onPress={handleLocate}
          style={({ pressed }) => [
            styles.locateButton,
            {
              top: insets.top + space.sm + bannerOffset + minTouch + space.sm,
              backgroundColor: colors.surface,
              borderColor: colors.divider,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <TargetGlyph color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  locateButton: {
    position: "absolute",
    right: space.sm,
    width: minTouch,
    height: minTouch,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
});
