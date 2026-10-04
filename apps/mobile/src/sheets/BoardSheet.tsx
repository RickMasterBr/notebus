/**
 * TL-03 Registrar (4.1 §6; canvas `Main.dc.html`, folha "Registrar embarque"; 4.5 §3; plano E-03 §3): o ponto sugerido
 * no topo com "Trocar", e as linhas que passam nele, a de horário esperado mais perto de agora em destaque. Um toque na
 * linha grava o embarque, fecha a folha e mostra o toast (Desfazer); o app aberto → Registrar → linha são 2 toques.
 *
 * Entradas: o botão flutuante do Início (`stopId` nulo: vale o ponto sugerido) e o "Registrar aqui" do Ponto (`stopId`
 * dado). "Trocar" abre a Busca reaproveitada em modo `pick`, que devolve o ponto escolhido sem abri-lo.
 *
 * Folha de um detent só, com a lista na receita da D-150 (lista numa `View` de altura fixa, a da folha aberta menos o
 * handle): um ponto com muitas linhas rola. Sem localização (E-07): o ponto não tem "mais perto · N m".
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { lisbonWallClock } from "@notebus/domain";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { type BoardChoice, boardChoices, relativeMinutes, suggestStop } from "../data/boardChoices";
import { clockText } from "../data/stopCard";
import { confidenceText } from "../data/stopCardText";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { PinGlyph } from "../ui/Glyphs";
import { ConfidenceSeal } from "../ui/ConfidenceSeal";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { SheetHandle } from "./SheetHandle";
import { useSheets, useStopPick } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

/** Identidade estável: a biblioteca remonta um handle novo a cada render do pai (ver `AheadSheet`). */
function BoardHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

/** Canvas: a folha tem 456 px num iPhone de 844 (≈ 54%). */
const DETENTS: StackedDetents = { snapPoints: ["56%"], initialIndex: 0, Handle: BoardHandle };

/** "esperado ~08:12 · daqui a 2 min". Horário de confiança alta não leva o "~" (4.6 §4). */
export function expectedText(choice: Pick<BoardChoice, "time" | "approximate" | "minutesAhead">): string {
  const rel = relativeMinutes(choice.minutesAhead);
  const relative =
    rel.kind === "now" ? t("common.now") : t(rel.kind === "in" ? "common.relative.in" : "common.relative.ago", { minutes: rel.minutes });
  const text = t("sheet_board.expected", { time: choice.time, relative });
  return choice.approximate ? text : text.replace("~", "");
}

export function BoardSheet({ id, stopId: initialStopId }: { id: number; stopId: string | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const registro = useRegistro();
  const recent = useRecentStops();
  const instant = useNowTick();
  const { dispatch } = useSheets();
  const stopPick = useStopPick();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const busy = useRef(false);

  const loading = schedule.status === "loading" || registro.status === "loading";
  const skeleton = useSkeletonVisible(loading);
  const data = schedule.status === "ready" ? schedule.data : null;

  // Ponto: o escolhido em "Trocar", o do "Registrar aqui", ou o sugerido (4.1 §6.1). Escolhido só uma vez pela abertura.
  const suggested = useMemo(
    () => (data ? suggestStop(registro.observations, instant, data, recent.ids[0] ?? null) : null),
    [data, registro.observations, instant, recent.ids],
  );
  const stopId = picked ?? initialStopId ?? suggested;
  const stopName = stopId && data ? (data.stopNames.get(stopId) ?? null) : null;
  const choices = useMemo(
    () => (data && stopId ? boardChoices(stopId, data, registro.records, instant) : []),
    [data, stopId, registro.records, instant],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]?.scrollAreaHeight ?? 0),
  );

  const pickStop = () => {
    stopPick.request((stop) => setPicked(stop.id));
    dispatch({ type: "push", sheet: { kind: "search", pick: true } });
  };

  const choose = (choice: BoardChoice) => {
    if (!stopId || busy.current) return;
    busy.current = true; // duplo toque não grava duas vezes
    close();
    void registro.board(stopId, choice);
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {t("sheet_board.title")}
            </Text>

            {/* O ponto: nome e "Trocar" (canvas: fundo `fill`, raio 14, padding 10 12, alvo >= 44 pt). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={stopName ? `${stopName}, ${t("sheet_board.change_stop.a11y")}` : t("sheet_board.pick_stop")}
              onPress={pickStop}
              style={({ pressed }) => [
                styles.stopBox,
                { backgroundColor: colors.fill },
                pressed && { opacity: 0.8 },
              ]}
            >
              <PinGlyph color={colors.accent} />
              {stopName ? (
                <>
                  <Text style={[type.bodyStrong, styles.stopName, { color: colors.text }]}>{stopName}</Text>
                  <View style={styles.change}>
                    <Text style={[type.subtitle, { color: colors.accent }]}>{t("sheet_board.change_button")}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[type.body, styles.stopName, { color: colors.textSecondary }]}>{t("sheet_board.pick_stop_hint")}</Text>
                  <View style={styles.change}>
                    <Text style={[type.subtitle, { color: colors.accent }]}>{t("sheet_board.pick_stop")}</Text>
                  </View>
                </>
              )}
            </Pressable>

            {stopId ? (
              <>
                <Text style={[type.label, { color: colors.textSecondary }]}>{t("sheet_board.line_prompt")}</Text>
                {loading || skeleton ? (
                  skeleton ? <Skeleton rows={2} /> : null
                ) : choices.length === 0 ? (
                  <Text style={[type.body, { color: colors.textSecondary }]}>{t("sheet_board.no_lines")}</Text>
                ) : (
                  choices.map((choice) => <ChoiceRow key={choice.key} choice={choice} onPress={() => choose(choice)} />)
                )}
                <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                  {t("sheet_board.time_note", { time: clockText(lisbonWallClock(instant).minute) })}
                </Text>
              </>
            ) : null}
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function ChoiceRow({ choice, onPress }: { choice: BoardChoice; onPress: () => void }) {
  const { colors } = useTheme();
  const expected = expectedText(choice);
  const label = [
    t("common.line.a11y", { line: choice.code }),
    choice.destination ? t("sheet_stop.line_direction", { destination: choice.destination }) : null,
    expected,
    confidenceText(choice.confidence),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        // Canvas: a passagem mais perto de agora vem com fundo destacado e borda violeta, para o toque cair nela sem ler.
        choice.highlighted
          ? { backgroundColor: colors.highlight, borderColor: colors.accent, borderWidth: 1.5 }
          : { borderColor: colors.divider, borderWidth: 1 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <LineBadge code={choice.code} color={choice.color} />
      <View style={styles.rowText}>
        {choice.destination ? (
          <Text style={[type.bodyStrong, { color: colors.text }]}>{t("sheet_stop.line_direction", { destination: choice.destination })}</Text>
        ) : null}
        <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{expected}</Text>
      </View>
      <ConfidenceSeal confidence={choice.confidence} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stopBox: { minHeight: minTouch, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  stopName: { flex: 1 },
  change: { minHeight: minTouch, paddingHorizontal: 6, justifyContent: "center" },
  // Canvas: altura mínima 64, raio 14, padding 10 12, 12 de intervalo.
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  rowText: { flex: 1, gap: 2 },
  num: { fontVariant: ["tabular-nums"] },
});
