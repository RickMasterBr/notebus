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
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { buildAlightList } from "../data/alightList";
import { type BoardChoice, boardChoices, relativeMinutes, suggestStop } from "../data/boardChoices";
import { type BoardOverOption, boardOverOptions, boardStep } from "../data/boardOverFlow";
import { type AlightRow } from "../data/rideView";
import { clockText } from "../data/stopCard";
import { confidenceText } from "../data/stopCardText";
import { useNowTick } from "../data/useNowTick";
import { useLastFix, usePositionStore } from "../data/PositionProvider";
import { useStopLocations } from "../data/StopLocationsProvider";
import { type SuggestedStop, chooseSuggestedStop, createFreezer, routineRank } from "../data/boardSuggestion";
import { realNow } from "../data/clock";
import { useNow } from "../data/NowProvider";
import { takeBoardOverIntent } from "../notifications/pendingIntent";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph, PinGlyph } from "../ui/Glyphs";
import { ChoiceSheetBody } from "../ui/ChoiceSheetBody";
import { ConfidenceSeal } from "../ui/ConfidenceSeal";
import { LineBadge } from "../ui/LineBadge";
import { NoticeLine } from "../ui/NoticeCard";
import { RouteStopRow } from "../ui/RouteStopRow";
import { Skeleton } from "../ui/Skeleton";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { SheetHandle } from "./SheetHandle";
import { useSheets, useStopPick } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { pressedStyle } from "../ui/pressed";

const HeightContext = createContext<{ setHeight: (height: number) => void; isAlight: boolean }>({
  setHeight: () => {},
  isAlight: false,
});

/** Identidade estável: a biblioteca remonta um handle novo a cada render do pai (ver `AheadSheet`). */
function BoardHandle({ onClose }: { onClose: () => void }) {
  const { setHeight, isAlight } = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton={isAlight} onPress={onClose} />
    </View>
  );
}

/** Canvas: a folha tem 456 px num iPhone de 844 (≈ 54%). */
const DETENTS: StackedDetents = { snapPoints: ["56%"], initialIndex: 0, Handle: BoardHandle };

type BoardStep =
  | { kind: "lines" }
  | { kind: "choose"; lineId: string; stopId: string; tapAt: number; choice?: BoardChoice }
  | { kind: "alight"; lineId: string; stopId: string; tapAt: number; choice?: BoardChoice };

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
  const now = useNow();
  const { dispatch } = useSheets();
  const stopPick = useStopPick();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState<BoardStep>(() => {
    const intent = takeBoardOverIntent();
    if (intent) {
      return { kind: "choose", lineId: intent.lineId, stopId: intent.stopId, tapAt: intent.tapAt };
    }
    return { kind: "lines" };
  });
  const [busyState, setBusyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const loading = schedule.status === "loading" || registro.status === "loading";
  const skeleton = useSkeletonVisible(loading);
  const data = schedule.status === "ready" ? schedule.data : null;

  // Permissão da posição: no primeiro toque em Registrar, em segundo plano. A folha não espera a resposta (D-108).
  const positionStore = usePositionStore();
  useEffect(() => {
    positionStore.askOnce();
  }, [positionStore]);

  // Ponto: o escolhido em "Trocar", o do "Registrar aqui", ou o sugerido (4.1 §6.1). A sugestão é decidida UMA vez, quando
  // os dados ficam prontos, com a última posição que já está em memória; nunca espera uma posição nova e nunca troca com
  // a folha aberta (D-108): só "Trocar" muda o ponto.
  const lastFix = useLastFix();
  const stopLocations = useStopLocations();
  const [freeze] = useState(() => createFreezer<SuggestedStop | null>());
  const suggestion = freeze(
    data !== null && registro.status === "ready" && recent.status === "ready" && stopLocations.status === "ready",
    () =>
      data
        ? chooseSuggestedStop({
            fix: lastFix,
            nowMs: realNow(),
            located: stopLocations.stops,
            routineStopId: suggestStop(registro.observations, instant, data, recent.ids[0] ?? null),
            lastUsedStopId: recent.ids[0] ?? null,
            routineRank: routineRank(registro.observations, instant, data),
          })
        : null,
  );
  const suggested = suggestion?.stopId ?? null;
  const stopId = step.kind === "lines" ? (picked ?? initialStopId ?? suggested) : step.stopId;
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
    const nowMs = now();
    const openRide = registro.tripCard
      ? {
          rideId: registro.tripCard.rideId,
          lineCode: registro.tripCard.line?.code ?? "",
          boardedTime: registro.tripCard.boardedTime,
        }
      : null;
    const decision = boardStep({ openRide, tapAt: nowMs });
    if (decision.kind === "board") {
      busy.current = true;
      close();
      void registro.board(stopId, choice);
    } else {
      setError(null);
      setStep({
        kind: "choose",
        lineId: choice.lineId,
        stopId,
        tapAt: nowMs,
        choice,
      });
    }
  };

  const handleOption = async (optionId: BoardOverOption["id"]) => {
    if (busyState || busy.current) return;
    if (step.kind !== "choose") return;

    if (optionId === "cancelar") {
      close();
      return;
    }

    if (optionId === "descida") {
      setError(null);
      setStep({
        kind: "alight",
        lineId: step.lineId,
        stopId: step.stopId,
        tapAt: step.tapAt,
        choice: step.choice,
      });
      return;
    }

    const activeChoice =
      step.choice ??
      choices.find((c) => c.lineId === step.lineId) ??
      ({
        key: step.lineId,
        lineId: step.lineId,
        code: data?.lineInfo.get(step.lineId)?.code ?? "",
        color: data?.lineInfo.get(step.lineId)?.color ?? colors.text,
        destination: null,
        time: "",
        approximate: false,
        minutesAhead: 0,
        confidence: "low",
        highlighted: false,
      } as BoardChoice);

    const openRideId = registro.tripCard?.rideId;
    if (!openRideId) return;

    busy.current = true;
    setBusyState(true);
    setError(null);

    const res = await registro.boardOver(
      step.stopId,
      activeChoice,
      { rideId: openRideId, choice: optionId },
      step.tapAt,
    );

    if (res && res.ok) {
      close();
    } else {
      busy.current = false;
      setBusyState(false);
      setError(t("board_over.failed"));
    }
  };

  const onSelectAlightStop = async (row: AlightRow) => {
    if (busyState || busy.current) return;
    if (step.kind !== "alight") return;
    if (!registro.tripCard?.trip) return;

    const activeChoice =
      step.choice ??
      choices.find((c) => c.lineId === step.lineId) ??
      ({
        key: step.lineId,
        lineId: step.lineId,
        code: data?.lineInfo.get(step.lineId)?.code ?? "",
        color: data?.lineInfo.get(step.lineId)?.color ?? colors.text,
        destination: null,
        time: "",
        approximate: false,
        minutesAhead: 0,
        confidence: "low",
        highlighted: false,
      } as BoardChoice);

    busy.current = true;
    setBusyState(true);
    setError(null);

    const res = await registro.boardOver(
      step.stopId,
      activeChoice,
      {
        rideId: registro.tripCard.rideId,
        choice: "descida",
        stopId: row.stopId,
        patternId: registro.tripCard.trip.patternId,
        position: row.position,
      },
      step.tapAt,
    );

    if (res && res.ok) {
      close();
    } else {
      busy.current = false;
      setBusyState(false);
      setError(t("board_over.failed"));
    }
  };

  const choiceStepInfo =
    step.kind === "choose"
      ? boardStep({
          openRide: registro.tripCard
            ? {
                rideId: registro.tripCard.rideId,
                lineCode: registro.tripCard.line?.code ?? "",
                boardedTime: registro.tripCard.boardedTime,
              }
            : null,
          tapAt: step.tapAt,
        })
      : null;

  return (
    <HeightContext.Provider value={{ setHeight: setHandleHeight, isAlight: step.kind === "alight" }}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {step.kind === "lines" && (
              <>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {t("sheet_board.title")}
                </Text>

                {/* O ponto: nome e "Trocar" (canvas: fundo `fill`, raio 14, padding 10 12, alvo >= 44 pt). */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={stopName ? `${stopName}, ${t("sheet_board.change_stop.a11y")}` : t("sheet_board.pick_stop")}
                  onPress={pickStop}
                  style={({ pressed }) => [styles.stopBox, { backgroundColor: colors.fill }, pressedStyle(pressed)]}
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
              </>
            )}

            {step.kind === "choose" && (
              <ChoiceSheetBody
                title={choiceStepInfo?.kind === "choose" ? choiceStepInfo.title : ""}
                subtitle={choiceStepInfo?.kind === "choose" ? choiceStepInfo.subtitle : undefined}
                error={error ?? undefined}
                options={boardOverOptions().map((opt) => ({
                  id: opt.id,
                  label: t(opt.labelKey),
                  tone: opt.tone,
                }))}
                onSelect={(optId) => void handleOption(optId as BoardOverOption["id"])}
                busy={busyState}
              />
            )}

            {step.kind === "alight" && (() => {
              const alightList =
                registro.tripCard && data
                  ? buildAlightList(registro.tripCard, data, step.tapAt, null)
                  : { rows: [], highlightedPosition: null };
              return (
                <View style={styles.alightContainer}>
                  <View style={styles.alightHeader}>
                    <Text accessibilityRole="header" style={[type.title, { color: colors.text, flex: 1 }]}>
                      {t("board_over.alight.title")}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("board_over.back_to_options")}
                      disabled={busyState}
                      accessibilityState={{ disabled: busyState }}
                      onPress={() => {
                        setError(null);
                        setStep({
                          kind: "choose",
                          lineId: step.lineId,
                          stopId: step.stopId,
                          tapAt: step.tapAt,
                          choice: step.choice,
                        });
                      }}
                      style={({ pressed }) => [styles.backButton, pressedStyle(pressed)]}
                    >
                      <View style={styles.backChevron}>
                        <ChevronRightGlyph color={colors.accent} />
                      </View>
                      <Text style={[type.body, { color: colors.accent }]}>
                        {t("board_over.back_to_options")}
                      </Text>
                    </Pressable>
                  </View>

                  {error ? <NoticeLine text={error} tone="danger" /> : null}

                  <View style={styles.stopListCol}>
                    {alightList.rows.map((row, index) => (
                      <RouteStopRow
                        key={`${row.position}:${row.stopId}`}
                        name={row.name}
                        time={row.time}
                        approximate={row.approximate}
                        passLabel={row.number ? t("sheet_stop.a11y.passage", { number: row.number }) : null}
                        lineColor={registro.tripCard?.line?.color ?? colors.text}
                        highlighted={row.position === alightList.highlightedPosition}
                        variant="choose"
                        isFirst={index === 0}
                        isLast={index === alightList.rows.length - 1}
                        accessibilityLabel={[
                          row.name,
                          row.time ? (row.approximate ? `~${row.time}` : row.time) : null,
                          row.number ? t("sheet_stop.a11y.passage", { number: row.number }) : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        onPress={() => void onSelectAlightStop(row)}
                      />
                    ))}
                  </View>
                </View>
              );
            })()}
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
        pressedStyle(pressed),
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
  alightContainer: { gap: space.md },
  alightHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: minTouch },
  backButton: { flexDirection: "row", alignItems: "center", minHeight: minTouch, gap: 4, paddingHorizontal: 6 },
  backChevron: { transform: [{ rotate: "180deg" }] },
  stopListCol: { flexDirection: "column" },
});
