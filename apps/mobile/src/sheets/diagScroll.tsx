// DIAG (E-02 bloco 5e): painel de diagnóstico da TL-05 e faixa da pilha de folhas. Sai quando o Rick medir (como no ccc5ca9).
// Sempre overlay absoluto com `pointerEvents` "box-none"/"none", fora do layout das folhas (D-150). Valores lidos de
// verdade ou "N/D".
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SCROLLABLE_STATUS, useBottomSheet, useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { radius, space, type, useTheme } from "../theme";
import { useSheets } from "./SheetsContext";

export const DIAG_SCROLL = true;

const BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D";

// ─── Variantes da TL-05 ──────────────────────────────────────────────────────

export type AheadVariant = "V0" | "V1";
export const AHEAD_VARIANT_NAMES: Record<AheadVariant, string> = {
  V0: "V0: como na main (controle)",
  V1: "V1: lista numa View de altura fixa (90% − handle), overflow hidden",
};

let currentVariant: AheadVariant = "V0";
const listeners = new Set<(v: AheadVariant) => void>();

export function useAheadVariant(): AheadVariant {
  const [variant, setVariant] = useState(currentVariant);
  useEffect(() => {
    listeners.add(setVariant);
    return () => void listeners.delete(setVariant);
  }, []);
  return variant;
}

function selectVariant(v: AheadVariant) {
  currentVariant = v;
  for (const l of listeners) l(v);
}

// ─── Último pedido de abertura de folha ──────────────────────────────────────

let lastOpen: { kind: string; at: number; sinceStartMs: number } | null = null;

/** Chamado pelo provedor da pilha a cada `push`. `at` é o "agora" do app (relógio de teste incluído). */
export function recordOpenRequest(kind: string, at: number) {
  lastOpen = { kind, at, sinceStartMs: Math.round(performance.now()) };
}

const clockText = (ms: number) => {
  const s = Math.floor(ms / 1000) % 86_400;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

function useStackText(): string {
  const { state } = useSheets();
  const top = state.stack[state.stack.length - 1];
  const list = state.stack.map((e) => `${e.kind}#${e.id}`).join(" > ");
  const open = lastOpen ? `${lastOpen.kind} às ${clockText(lastOpen.at)} (app +${lastOpen.sinceStartMs} ms)` : "N/D";
  return `Pilha: [${list}] topo=${top ? `${top.kind}#${top.id}` : "N/D"} | último pedido: ${open}`;
}

/** Faixa fina no pé da tela, sem toque: a pilha de folhas e o último pedido de abertura, para fotografar se a gaveta travar. */
export function StackDiagStrip() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const text = useStackText();
  if (!DIAG_SCROLL) return null;
  return (
    <View pointerEvents="none" style={[styles.strip, { bottom: insets.bottom, backgroundColor: colors.surface, borderColor: colors.divider }]}>
      <Text style={[styles.metric, { color: colors.text }]}>{`[DIAG] ${BUILD_SHA} · ${text}`}</Text>
    </View>
  );
}

// ─── Painel da rolagem da TL-05 ──────────────────────────────────────────────

export interface AheadScrollMetrics {
  viewport: number | null;
  content: number | null;
  offset: number;
  fixedHeight: number | null;
  scrollEvents: number;
}

/** Dentro do `BottomSheet` (usa os hooks da biblioteca). */
export function AheadDiagPanel({ metrics, variant }: { metrics: AheadScrollMetrics; variant: AheadVariant }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nowText = clockText(useNow()());
  const stackText = useStackText();
  const [open, setOpen] = useState(true);

  const { animatedPosition } = useBottomSheet();
  const [position, setPosition] = useState<number | null>(null);
  const setPositionRounded = useCallback((v: number) => setPosition(Math.round(v)), []);
  useAnimatedReaction(
    () => animatedPosition.value,
    (cur, prev) => {
      if (prev === null || Math.abs(cur - prev) >= 1) runOnJS(setPositionRounded)(cur);
    },
    [animatedPosition],
  );

  const internal = useBottomSheetInternal(true);
  const [status, setStatus] = useState("N/D");
  useAnimatedReaction(
    () => internal?.animatedScrollableStatus?.value,
    (val) => {
      const name =
        val === SCROLLABLE_STATUS.LOCKED ? "LOCKED" : val === SCROLLABLE_STATUS.UNLOCKED ? "UNLOCKED" : val === SCROLLABLE_STATUS.UNDETERMINED ? "UNDETERMINED" : "N/D";
      runOnJS(setStatus)(name);
    },
    [internal],
  );

  if (!DIAG_SCROLL) return null;
  const r = (n: number | null) => (n === null ? "N/D" : String(Math.round(n)));
  const max = metrics.viewport !== null && metrics.content !== null ? Math.max(0, metrics.content - metrics.viewport) : null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + space.xs }]}>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <View style={styles.row}>
          <Text style={[styles.metric, { color: colors.accent, fontWeight: "700", flex: 1 }]}>{`[DIAG] AHEAD · ${BUILD_SHA} · ${nowText} · ${variant}`}</Text>
          <Pressable onPress={() => setOpen(!open)} style={[styles.button, { borderColor: colors.divider, backgroundColor: colors.fill }]}>
            <Text style={[styles.metric, { color: colors.text }]}>{open ? "recolher" : "abrir"}</Text>
          </Pressable>
        </View>
        {open ? (
          <>
            <View style={styles.row}>
              {(["V0", "V1"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => selectVariant(v)}
                  style={[styles.button, { flex: 1, borderColor: colors.divider, backgroundColor: variant === v ? colors.accent : colors.fill }]}
                >
                  <Text style={[styles.metric, { color: variant === v ? colors.onAccent : colors.text, fontWeight: "700" }]}>{v}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.metric, { color: colors.textSecondary }]}>{AHEAD_VARIANT_NAMES[variant]}</Text>
            <Text style={[styles.metric, { color: colors.text }]}>
              {`Viewport: ${r(metrics.viewport)} | Conteúdo: ${r(metrics.content)} | Offset: ${r(metrics.offset)}/${r(max)} | Altura fixa V1: ${r(metrics.fixedHeight)}`}
            </Text>
            <Text style={[styles.metric, { color: colors.text }]}>{`Topo da folha: ${position === null ? "N/D" : `${position} pt`} | Biblioteca: ${status} | onScroll: ${metrics.scrollEvents}`}</Text>
            <Text style={[styles.metric, { color: colors.textSecondary }]}>{stackText}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 0, right: 0, zIndex: 9999, paddingHorizontal: space.sm },
  panel: { borderWidth: 1, borderRadius: radius.sm, padding: space.xs, gap: 3 },
  row: { flexDirection: "row", gap: space.xs, alignItems: "center" },
  button: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" },
  strip: { position: "absolute", left: space.sm, right: space.sm, zIndex: 9998, borderWidth: 1, borderRadius: radius.sm, padding: 2 },
  metric: { fontSize: 10, lineHeight: 12, fontVariant: ["tabular-nums"] },
});
