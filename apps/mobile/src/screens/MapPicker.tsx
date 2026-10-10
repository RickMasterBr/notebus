/**
 * Seletor de posição no mapa (E-07 7b Bloco 7b, D-096, D-107, D-110, D-179).
 * Abre em tela cheia com um alfinete que se move ao toque.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type PressEvent,
  type PressEventWithFeatures,
} from "@maplibre/maplibre-react-native";
import type { GeoPoint } from "@notebus/domain";
import { realNow } from "../data/clock";
import {
  PICK_MAX_ZOOM,
  type PickStart,
  type PickState,
  pickStart,
  resolvePick,
  runPickResult,
  shouldResolveStart,
  tapPin,
} from "../data/mapPick";
import {
  findCasaPoint,
  MAP_STYLE_DARK,
  MAP_STYLE_LIGHT,
} from "../data/mapStart";
import { usePlaces } from "../data/PlacesProvider";
import { usePositionStore } from "../data/PositionProvider";
import { useToast } from "../data/ToastProvider";
import { readLastMapPosition } from "../db/appState";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { SELECTOR_CLOSED, SELECTOR_OPENED } from "../sheets/diagLog";
import { DIAG_SCROLL, recordDiagEvent } from "../sheets/diagScroll";
import { useReduceMotion } from "../sheets/useReduceMotion";
import {
  elevation,
  opacity,
  radius,
  space,
  type,
  useTheme,
} from "../theme";

export interface MapPickerProps {
  visible: boolean;
  existing: GeoPoint | null;
  onCancel: () => void;
  onConfirm: (point: GeoPoint) => void;
}

export function MapPicker({
  visible,
  existing,
  onCancel,
  onConfirm,
}: MapPickerProps) {
  if (!visible) {
    return null;
  }

  return (
    <MapPickerContent
      existing={existing}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function MapPickerContent({
  existing,
  onCancel,
  onConfirm,
}: Omit<MapPickerProps, "visible">) {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const store = usePositionStore();
  const places = usePlaces();
  const toast = useToast();

  const [start, setStart] = useState<PickStart | null>(null);
  const [state, setState] = useState<PickState>({ pin: null });

  const latest = useRef({ existing, places });
  latest.current = { existing, places };
  const resolvedRef = useRef(false);

  // Resolve o ponto inicial na abertura sem esperar GPS
  useEffect(() => {
    if (!shouldResolveStart({ alreadyResolved: resolvedRef.current, placesReady: places.status === "ready" })) return;
    resolvedRef.current = true;
    let alive = true;
    void (async () => {
      const fix = store.getFix();
      const currentPlaces = latest.current.places;
      const home = currentPlaces.status === "ready" ? findCasaPoint(currentPlaces.places) : null;
      const db = getSharedDb();
      const lastMapPosition = db ? await readLastMapPosition(db) : null;
      const nowMs = realNow();

      const initial = pickStart({
        existing: latest.current.existing,
        fix,
        nowMs,
        home,
        lastMapPosition,
      });

      if (alive) {
        setStart(initial);
        setState({ pin: initial.pin });
      }
    })();

    return () => {
      alive = false;
    };
  }, [places.status, store]);

  // Diag (E-07 Bloco 9): anota abertura e fechamento do seletor
  useEffect(() => {
    if (!DIAG_SCROLL) return;
    recordDiagEvent(SELECTOR_OPENED);
    return () => {
      recordDiagEvent(SELECTOR_CLOSED);
    };
  }, []);

  const handleMapPress = useCallback(
    (e: NativeSyntheticEvent<PressEvent> | NativeSyntheticEvent<PressEventWithFeatures>) => {
      const lngLat = e.nativeEvent?.lngLat;
      if (!lngLat || lngLat.length < 2) return;
      const [lon, lat] = lngLat;
      if (typeof lon !== "number" || typeof lat !== "number") return;
      setState((cur) => tapPin(cur, { lat, lon }));
    },
    [],
  );

  const handleFail = useCallback(() => {
    onCancel();
    toast.show({ title: t("map_pick.unavailable") });
  }, [onCancel, toast]);

  const handleConfirm = useCallback(() => {
    runPickResult(resolvePick(state), {
      onConfirm,
      askFar: (p) =>
        Alert.alert(t("place.location.far"), undefined, [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("stop.location_offer.save"), onPress: () => onConfirm(p) },
        ]),
    });
  }, [onConfirm, state]);

  const pinGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!state.pin) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [state.pin.lon, state.pin.lat],
          },
          properties: {},
        },
      ],
    };
  }, [state.pin]);

  const hasNoPin = state.pin === null;
  const mapStyleUrl = theme.name === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;

  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onCancel}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
        {start !== null ? (
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
                top: insets.top + space.sm,
                left: space.md,
              }}
              logo={false}
              doubleTapZoom={false}
              onDidFailLoadingMap={handleFail}
              onPress={handleMapPress}
            >
              <Camera
                initialViewState={{
                  center: [start.point.lon, start.point.lat],
                  zoom: start.zoom,
                }}
                maxZoom={PICK_MAX_ZOOM}
              />
              <GeoJSONSource id="pick-pin" data={pinGeoJSON}>
                <Layer
                  id="pick-pin-circle"
                  type="circle"
                  paint={{
                    "circle-radius": 10,
                    "circle-color": colors.accent,
                    "circle-stroke-width": 3,
                    "circle-stroke-color": theme.name === "dark" ? colors.surface : "#FFFFFF",
                  }}
                />
              </GeoJSONSource>
            </Map>
          </View>
        ) : null}

        {/* Pílula no topo: Dica */}
        <View
          pointerEvents="box-none"
          style={[styles.topBar, { top: insets.top + space.sm }]}
        >
          <View
            style={[
              styles.hintPill,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.full,
                ...elevation.card,
              },
            ]}
            accessibilityRole="header"
          >
            <Text style={[type.subtitle, { color: colors.text }]}>
              {t("map_pick.hint")}
            </Text>
          </View>
        </View>

        {/* Botões embaixo */}
        <View
          pointerEvents="box-none"
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom + space.sm },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("map_pick.cancel.a11y")}
            onPress={onCancel}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.fill },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.text }]}>
              {t("common.cancel")}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("map_pick.confirm.a11y")}
            accessibilityState={{ disabled: hasNoPin }}
            accessibilityHint={hasNoPin ? t("map_pick.confirm.needs_tap.a11y") : undefined}
            onPress={handleConfirm}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              hasNoPin && { opacity: opacity.muted },
              pressed && !hasNoPin && { opacity: 0.6 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
              {t("map_pick.confirm")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  hintPill: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    zIndex: 10,
  },
  // Segue o "Registrar aqui" de StopSheet.tsx: altura 48, raio 24
  button: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
