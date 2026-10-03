// DEV: Painel de diagnóstico de rolagem em tempo de execução (E-02)
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SCROLLABLE_STATUS, useBottomSheet, useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { useNow } from "../data/NowProvider";
import { useSheets } from "./SheetsContext";
import { radius, space, type, useTheme } from "../theme";

export const DIAG_SCROLL = true;

export type ScrollVariant = "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9";

const VARIANT_NAMES: Record<ScrollVariant, string> = {
  V0: "V0: Bloco 5b (Controle)",
  V1: "V1: Viewport Dinâmico + PointerEvents",
  V2: "V2: RNGH ScrollView + Desarmar Base",
  V3: "V3: Detent Único 90% (TL-02 Tall)",
  V4: "V4: Altura Estática JS (sem animação)",
  V5: "V5: Remontar ScrollView (Key) após assentar",
  V6: "V6: V4 + V5",
  V7: "V7: Remontagem a Cada Detent Assentado + Offset",
  V8: "V8: Viewport Medido por Wrapper Não Animado no Assentamento",
  V9: "V9: Altura fixa da gaveta aberta + respiro por detent",
};

let currentVariant: ScrollVariant = "V9";
const variantListeners = new Set<(v: ScrollVariant) => void>();
const resetListeners = new Set<() => void>();

export function getScrollVariant(): ScrollVariant {
  return currentVariant;
}

export function setScrollVariant(v: ScrollVariant) {
  currentVariant = v;
  for (const listener of variantListeners) {
    listener(v);
  }
  for (const r of resetListeners) {
    r();
  }
}

export function onResetScrollVariant(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => {
    resetListeners.delete(cb);
  };
}

export function useScrollVariant(): ScrollVariant {
  const [variant, setVariant] = useState<ScrollVariant>(currentVariant);
  useEffect(() => {
    const l = (v: ScrollVariant) => setVariant(v);
    variantListeners.add(l);
    return () => {
      variantListeners.delete(l);
    };
  }, []);
  return variant;
}

export interface DiagLayoutEvent {
  order: number;
  ms: number;
  level: "root" | "content" | "wrapper" | "scrollView" | "contentSize" | "body" | "animate" | "change";
  h?: number;
  y?: number;
  w?: number;
  extra?: string;
}

export interface DiagNativeScrollMetrics {
  layoutH: number;
  contentH: number;
  offsetY: number;
  insetBottom: number;
  onScrollCount: number;
  beginDragCount: number;
  endDragCount: number;
  lastAnimate?: { from: number; to: number; ms: number };
  lastChange?: { index: number; ms: number };
}

export interface DiagGeometryMetrics {
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  containerHeight: number;
  snapPoints: (number | string)[];
}

export interface DiagSpacerMetrics {
  measured: number;
  animated: number;
}

export interface DiagSheetMetrics {
  detent: number;
  viewportHeight: number;
  contentHeight: number;
  contentOffsetY: number;
  maxScrollOffset: number;
  activeChip?: string;
}

// SHA e versão de build via variável de ambiente do build (ou "N/D")
const BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D";
const BUILD_VERSION = "1.0.0-dev";

export function DiagScrollPanel({
  sheetKind,
  metrics,
  nativeScroll,
  geometry,
  spacerMetrics,
  events = [],
}: {
  sheetKind: "home" | "stop";
  metrics: DiagSheetMetrics;
  nativeScroll: DiagNativeScrollMetrics;
  geometry: DiagGeometryMetrics;
  spacerMetrics?: DiagSpacerMetrics;
  events?: DiagLayoutEvent[];
}) {
  const { colors } = useTheme();
  const variant = useScrollVariant();
  const { state } = useSheets();
  const nowMs = useNow()();
  const [panelEnabled, setPanelEnabled] = useState(false);

  // animatedPosition real via useBottomSheet + useAnimatedReaction (máx ~10 Hz, diff >= 1 pt)
  const { animatedPosition } = useBottomSheet();
  const [liveAnimPos, setLiveAnimPos] = useState<number | null>(null);
  const lastAnimPosRef = useRef<number>(-9999);
  const lastAnimPosTimeRef = useRef<number>(0);

  const updateAnimPosJS = useCallback((val: number) => {
    const now = performance.now();
    if (now - lastAnimPosTimeRef.current >= 100 || Math.abs(val - lastAnimPosRef.current) >= 10) {
      lastAnimPosTimeRef.current = now;
      lastAnimPosRef.current = val;
      setLiveAnimPos(Math.round(val));
    }
  }, []);

  useAnimatedReaction(
    () => animatedPosition.value,
    (curr, prev) => {
      if (prev === null || Math.abs(curr - prev) >= 1) {
        runOnJS(updateAnimPosJS)(curr);
      }
    },
    [animatedPosition, updateAnimPosJS]
  );

  // scrollableStatus real via useBottomSheetInternal
  const internal = useBottomSheetInternal(true);
  const [scrollableStatus, setScrollableStatus] = useState<string>("N/D");

  useAnimatedReaction(
    () => internal?.animatedScrollableStatus?.value,
    (val) => {
      if (val === SCROLLABLE_STATUS.LOCKED) runOnJS(setScrollableStatus)("LOCKED");
      else if (val === SCROLLABLE_STATUS.UNLOCKED) runOnJS(setScrollableStatus)("UNLOCKED");
      else if (val === SCROLLABLE_STATUS.UNDETERMINED) runOnJS(setScrollableStatus)("UNDETERMINED");
      else if (val === undefined || val === null) runOnJS(setScrollableStatus)("N/D");
      else runOnJS(setScrollableStatus)(`STATUS_${val}`);
    },
    [internal]
  );

  const handleSelect = useCallback((v: ScrollVariant) => {
    setScrollVariant(v);
  }, []);

  if (!DIAG_SCROLL) return null;

  // Botão pequeno flutuante quando o painel estiver desligado
  if (!panelEnabled) {
    return (
      <View pointerEvents="box-none" style={styles.overlayContainer}>
        <Pressable
          onPress={() => setPanelEnabled(true)}
          style={[styles.miniButton, { backgroundColor: colors.surface, borderColor: colors.accent }]}
        >
          <Text style={[type.caption, { color: colors.accent, fontWeight: "700" }]}>
            {"DEV"}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Deriva caminho de abertura da pilha
  const stackSummary = state.stack.map((s) => s.kind).join(" > ");
  const openedVia =
    sheetKind === "stop"
      ? state.stack.some((s) => s.kind === "search")
        ? "Busca (Início > Busca > Ponto)"
        : "Cartão (Início > Ponto)"
      : "Base (Início)";

  const seconds = Math.floor(nowMs / 1000) % 86400;
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const timeStr = `${hh}:${mm}:${ss}`;

  return (
    <View pointerEvents="box-none" style={styles.overlayContainer}>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <View style={styles.headerRow}>
          <Text style={[type.caption, { color: colors.accent, fontWeight: "700" }]}>
            {`[DIAG] ${sheetKind.toUpperCase()} · ${BUILD_SHA} (${BUILD_VERSION}) ${timeStr}`}
          </Text>
          <Pressable
            onPress={() => setPanelEnabled(false)}
            style={[styles.toggleButton, { backgroundColor: colors.fill, borderColor: colors.divider }]}
          >
            <Text style={[type.caption, { color: colors.textSecondary }]}>Desligar</Text>
          </Pressable>
        </View>

        {/* Seletor de Variantes tocável em 3 linhas */}
        <View style={styles.variantContainer}>
          <View style={styles.variantRow}>
            {(["V0", "V1", "V2", "V3"] as const).map((v) => {
              const active = variant === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => handleSelect(v)}
                  style={[
                    styles.variantButton,
                    {
                      backgroundColor: active ? colors.accent : colors.fill,
                      borderColor: active ? colors.accent : colors.divider,
                    },
                  ]}
                >
                  <Text style={[type.caption, styles.buttonText, { color: active ? colors.onAccent : colors.text }]}>
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.variantRow}>
            {(["V4", "V5", "V6"] as const).map((v) => {
              const active = variant === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => handleSelect(v)}
                  style={[
                    styles.variantButton,
                    {
                      backgroundColor: active ? colors.accent : colors.fill,
                      borderColor: active ? colors.accent : colors.divider,
                    },
                  ]}
                >
                  <Text style={[type.caption, styles.buttonText, { color: active ? colors.onAccent : colors.text }]}>
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.variantRow}>
            {(["V7", "V8", "V9"] as const).map((v) => {
              const active = variant === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => handleSelect(v)}
                  style={[
                    styles.variantButton,
                    {
                      backgroundColor: active ? colors.accent : colors.fill,
                      borderColor: active ? colors.accent : colors.divider,
                    },
                  ]}
                >
                  <Text style={[type.caption, styles.buttonText, { color: active ? colors.onAccent : colors.text }]}>
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={[type.caption, { color: colors.textSecondary }]}>{VARIANT_NAMES[variant]}</Text>

        {/* Linhas de métricas em tempo real */}
        <View style={styles.metricsGrid}>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Detent: ${metrics.detent} | Topo anim: ${liveAnimPos !== null ? `${liveAnimPos} pt` : "N/D"} | Status: ${scrollableStatus}`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Viewport: ${Math.round(metrics.viewportHeight)} pt | Conteúdo: ${Math.round(metrics.contentHeight)} pt | Offset: ${Math.round(metrics.contentOffsetY)}/${Math.round(metrics.maxScrollOffset)} pt`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {variant === "V0"
              ? `Spacer V0: medido ${Math.round(spacerMetrics?.measured ?? 0)} pt / animado ${Math.round(spacerMetrics?.animated ?? 0)} pt`
              : `Spacer: desativado (0 pt)`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Scroll Nativo: layoutH=${Math.round(nativeScroll.layoutH)} contentH=${Math.round(nativeScroll.contentH)} offset=${Math.round(nativeScroll.offsetY)} insetB=${Math.round(nativeScroll.insetBottom)}`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Contadores: scroll=${nativeScroll.onScrollCount} beginDrag=${nativeScroll.beginDragCount} endDrag=${nativeScroll.endDragCount} | Chip: ${metrics.activeChip ?? "N/D"}`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.textSecondary }]}>
            {`Geometria: winH=${geometry.windowHeight} top=${geometry.topInset} bot=${geometry.bottomInset} contH=${geometry.containerHeight} snaps=[${geometry.snapPoints.join(",")}]`}
          </Text>
          {nativeScroll.lastAnimate || nativeScroll.lastChange ? (
            <Text style={[type.caption, styles.metric, { color: colors.textSecondary }]}>
              {`Folha: ${nativeScroll.lastAnimate ? `anim(${nativeScroll.lastAnimate.from}->${nativeScroll.lastAnimate.to} +${nativeScroll.lastAnimate.ms}ms)` : ""} ${nativeScroll.lastChange ? `chg(${nativeScroll.lastChange.index} +${nativeScroll.lastChange.ms}ms)` : ""}`}
            </Text>
          ) : null}
          <Text style={[type.caption, styles.metric, { color: colors.textSecondary }]}>
            {`Via: ${openedVia} | Pilha: [${stackSummary}]`}
          </Text>
        </View>

        {/* Buffer de Ancestrais (últimos eventos) */}
        {events.length > 0 ? (
          <View style={styles.logContainer}>
            <Text style={[type.caption, { color: colors.accent, fontWeight: "700" }]}>
              {`Log Ancestrais [E02] (últimos ${events.length}):`}
            </Text>
            {events.slice(-12).map((ev) => (
              <Text key={`${ev.order}-${ev.level}`} style={[type.caption, styles.logLine, { color: colors.textSecondary }]}>
                {`#${ev.order} +${ev.ms}ms [${ev.level}] h=${ev.h ?? "-"} y=${ev.y !== undefined ? ev.y : "-"} ${ev.extra ?? ""}`}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
  },
  miniButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 4,
    paddingVertical: 1,
    opacity: 0.5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  panel: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.xs,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  variantContainer: {
    gap: 4,
  },
  variantRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  variantButton: {
    flex: 1,
    paddingVertical: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: "700",
  },
  metricsGrid: {
    gap: 1,
    marginTop: 1,
  },
  metric: {
    fontVariant: ["tabular-nums"],
    fontSize: 10,
    lineHeight: 12,
  },
  logContainer: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#33333333",
    paddingTop: 2,
    gap: 1,
  },
  logLine: {
    fontVariant: ["tabular-nums"],
    fontSize: 9,
    lineHeight: 11,
  },
});

