// DEV: Painel de diagnóstico de rolagem em tempo de execução (E-02)
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNow } from "../data/NowProvider";
import { useSheets } from "./SheetsContext";
import { radius, space, type, useTheme } from "../theme";

export const DIAG_SCROLL = true;

export type ScrollVariant = "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8";

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
};

let currentVariant: ScrollVariant = "V8";
const listeners = new Set<(v: ScrollVariant) => void>();

export function getScrollVariant(): ScrollVariant {
  return currentVariant;
}

export function setScrollVariant(v: ScrollVariant) {
  currentVariant = v;
  for (const listener of listeners) {
    listener(v);
  }
}

export function useScrollVariant(): ScrollVariant {
  const [variant, setVariant] = useState<ScrollVariant>(currentVariant);
  useEffect(() => {
    const l = (v: ScrollVariant) => setVariant(v);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return variant;
}

export interface DiagSheetMetrics {
  detent: number;
  animatedPosition: number;
  viewportHeight: number;
  contentHeight: number;
  spacerHeight: number;
  contentOffsetY: number;
  maxScrollOffset: number;
  activeChip?: string;
  scrollableStatus?: string;
}

// SHA e versão de build
const BUILD_SHA = "7862d85+E02";
const BUILD_VERSION = "1.0.0-dev";

export function DiagScrollPanel({
  sheetKind,
  metrics,
}: {
  sheetKind: "home" | "stop";
  metrics: DiagSheetMetrics;
}) {
  const { colors } = useTheme();
  const variant = useScrollVariant();
  const { state } = useSheets();
  const nowMs = useNow()();

  const handleSelect = useCallback((v: ScrollVariant) => {
    setScrollVariant(v);
  }, []);

  if (!DIAG_SCROLL) return null;

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
    <View pointerEvents="box-none" style={styles.container}>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <View style={styles.headerRow}>
          <Text style={[type.label, { color: colors.accent }]}>
            {`[DIAG] ${sheetKind.toUpperCase()} · ${BUILD_SHA} (${BUILD_VERSION}) ${timeStr}`}
          </Text>
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
                  <Text
                    style={[
                      type.caption,
                      styles.buttonText,
                      { color: active ? colors.onAccent : colors.text },
                    ]}
                  >
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
                  <Text
                    style={[
                      type.caption,
                      styles.buttonText,
                      { color: active ? colors.onAccent : colors.text },
                    ]}
                  >
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.variantRow}>
            {(["V7", "V8"] as const).map((v) => {
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
                  <Text
                    style={[
                      type.caption,
                      styles.buttonText,
                      { color: active ? colors.onAccent : colors.text },
                    ]}
                  >
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          {VARIANT_NAMES[variant]}
        </Text>

        {/* Linhas de métricas em tempo real */}
        <View style={styles.metricsGrid}>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Detent: ${metrics.detent} | Topo: ${Math.round(metrics.animatedPosition)} pt`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Viewport: ${Math.round(metrics.viewportHeight)} pt | Conteúdo: ${Math.round(metrics.contentHeight)} pt`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Spacer: ${Math.round(metrics.spacerHeight)} pt | Offset: ${Math.round(metrics.contentOffsetY)} / ${Math.round(metrics.maxScrollOffset)} pt`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.text }]}>
            {`Chip: ${metrics.activeChip ?? "N/A"} | Status: ${metrics.scrollableStatus ?? "N/A"}`}
          </Text>
          <Text style={[type.caption, styles.metric, { color: colors.textSecondary }]}>
            {`Via: ${openedVia} | Pilha: [${stackSummary}]`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    zIndex: 999,
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
  variantContainer: {
    gap: 4,
  },
  variantRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  variantButton: {
    flex: 1,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: "700",
  },
  metricsGrid: {
    gap: 2,
    marginTop: 2,
  },
  metric: {
    fontVariant: ["tabular-nums"],
  },
});
