/**
 * O componente do mapa no Início (E-07 7b Bloco 4, D-096, D-108, D-110, D-179).
 * Fica atrás de tudo na tela do Início.
 * Todo import do @maplibre/maplibre-react-native fica neste arquivo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  Map,
  UserLocation,
  type CameraRef,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import { usePositionPermission, usePositionStore } from "../data/PositionProvider";
import { usePlaces } from "../data/PlacesProvider";
import { useTestClock } from "../data/TestClockProvider";
import { useNow } from "../data/NowProvider";
import { useToast } from "../data/ToastProvider";
import { realNow } from "../data/clock";
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

/** Recuo de câmera para a folha pequena (altura de fallback de 120 pt). */
const SMALL_SHEET_INSET = 120;

export function MapBackdrop() {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { state } = useSheets();
  const { chosen } = useTestClock();
  const now = useNow();
  const toast = useToast();
  const store = usePositionStore();
  const permission = usePositionPermission();
  const places = usePlaces();
  const reduceMotion = useReduceMotion();

  const cameraRef = useRef<CameraRef>(null);
  const [opening, setOpening] = useState<MapOpening | null>(null);
  const [failed, setFailed] = useState(false);

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

  // Grava a última posição quando o usuário para de mexer no mapa (no máximo 1 gravação/s)
  const lastSavedRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleRegionDidChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
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
      const fix = store.getFix();
      if (!fix) {
        toast.show({ title: t("map.no_fix") });
        void store.warm();
        return;
      }

      cameraRef.current?.flyTo({
        center: [fix.lon, fix.lat],
        zoom: 16,
        padding: { bottom: SMALL_SHEET_INSET },
        duration: reduceMotion ? 0 : 1200,
      });
      void store.warm();
    }
  }, [store, toast, reduceMotion]);

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
              padding: { bottom: SMALL_SHEET_INSET },
            }}
            maxZoom={16}
          />
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
