/**
 * TL-04 Ir para X (E-05 §4.2, Bloco 3 Item 2; D-034, D-150, D-175).
 *
 * Folha empilhada com 3 detents seguindo o padrão de StopSheet (D-150):
 * - Pequeno: handle + cabeçalho + 1º cartão visível (o próximo/mais rápido).
 * - Médio (50%) e Grande (90%): lista completa de opções ao vivo.
 * - Relógio ao vivo recalculado a cada minuto (useNowTick).
 * - Toque no cartão de ônibus abre TL-05 (AheadSheet).
 * - Cartão a pé informativo sem ação de toque.
 * - Troca de origem com persistência em setting (D-175).
 * - Caso sem serviço (T-50): motivo e próximo serviço.
 */
import { BottomSheetScrollView, useBottomSheet } from "@gorhom/bottom-sheet";
import {
  gotoCards,
  lisbonWallClock,
  type BusCandidate,
  type WalkCandidate,
} from "@notebus/domain";
import * as Haptics from "expo-haptics";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNowTick } from "../data/useNowTick";
import { usePlaces } from "../data/PlacesProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { buildGotoInputFromSources } from "../data/gotoData";
import { resolveGotoNoService } from "../data/gotoNoService";
import { resolveGotoOrigin } from "../data/gotoOrigin";
import { clockText } from "../data/stopCard";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import {
  ChevronRightGlyph,
  PlaceIconGlyph,
  PlusGlyph,
  WalkingGlyph,
} from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { HiddenBelowSpacer } from "./HiddenBelowSpacer";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { type Detent, activeSheet } from "./stack";
import { useToast } from "../data/ToastProvider";
import { useTestClock } from "../data/TestClockProvider";
import { realNow } from "../data/clock";
import { ensureAlarmPermission } from "../notifications/permission";
import { expoPort } from "../notifications/expoPort";
import { requestReschedule } from "../notifications/runtime";
import { sharedAlarms, type AlarmRow } from "../db/alarms";
import { getSharedDb } from "../db/sharedDb";
import {
  alarmFromCard,
  alarmFromRow,
  alarmOfCard,
  alarmSummary,
  createAskController,
  weekdayPluralKey,
} from "../data/alarmsUi";
import { hasShownAlarmFocusHint, markAlarmFocusHintShown } from "../db/appState";
import { formatServiceMinute } from "@notebus/domain";

const START_INDEX = 0;
const LAST_INDEX = 2;
const SMALL_FALLBACK = 260;
const SMALL_MAX_SHARE = 0.45;

const GotoSheetContext = createContext<{
  detent: Detent;
  setHandleHeight: (height: number) => void;
}>({
  detent: START_INDEX,
  setHandleHeight: () => {},
});

function GotoHandle({ onClose }: { onClose: () => void }) {
  const { detent, setHandleHeight } = useContext(GotoSheetContext);
  const { snapToIndex } = useBottomSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="adjustable"
        detent={detent}
        onIncrement={() => snapToIndex(Math.min(detent + 1, LAST_INDEX))}
        onDecrement={() => snapToIndex(Math.max(detent - 1, 0))}
        onClose={onClose}
      />
    </View>
  );
}

export function GotoSheet({
  id,
  destinationPlaceId,
  originPlaceId: initialOriginId,
}: {
  id: number;
  destinationPlaceId: string;
  originPlaceId?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { state, dispatch } = useSheets();
  const toast = useToast();
  const testClock = useTestClock();
  const places = usePlaces();
  const registro = useRegistro();
  const schedule = useSchedule();
  const scheduleData = schedule.status === "ready" ? schedule.data : null;
  const instant = useNowTick();

  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const loadAlarms = useCallback(async () => {
    const db = getSharedDb();
    if (!db) return;
    try {
      const list = await sharedAlarms(db).listAlarms();
      setAlarms(list);
    } catch {
      // Ignora erro de leitura
    }
  }, []);

  const isTop = activeSheet(state).id === id;
  useEffect(() => {
    if (isTop) void loadAlarms();
  }, [isTop, loadAlarms]);

  const [detent, setDetent] = useState<Detent>(START_INDEX);
  const [handleHeight, setHandleHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [firstCardHeight, setFirstCardHeight] = useState(0);
  const [isChoosingOrigin, setIsChoosingOrigin] = useState(false);

  // Destino
  const destinationPlace = places.places.find(
    (p) => p.id === destinationPlaceId && p.deletedAt === null,
  );

  // Resolução inicial da origem (D-175)
  const defaultOriginResolution = useMemo(() => {
    return resolveGotoOrigin({
      destinationPlaceId,
      places: places.places,
      routes: places.routes,
      options: places.options,
      lastOriginMap: places.gotoLastOrigins,
    });
  }, [destinationPlaceId, places.places, places.routes, places.options, places.gotoLastOrigins]);

  // Origem selecionada no momento (se initialOriginId foi passado e existe, usa; senão resolvida)
  const [userSelectedOriginId, setUserSelectedOriginId] = useState<string | null>(
    () => initialOriginId ?? (defaultOriginResolution.kind === "resolved" ? defaultOriginResolution.originPlaceId : null),
  );

  const activeOriginId =
    userSelectedOriginId ??
    (defaultOriginResolution.kind === "resolved" ? defaultOriginResolution.originPlaceId : null);

  const originPlace = places.places.find(
    (p) => p.id === activeOriginId && p.deletedAt === null,
  );

  // Trajeto ativo para o par origem ↔ destino (ignora trajeto sem opção ativa)
  const activeRoute = useMemo(() => {
    if (!activeOriginId) return null;
    return (
      places.routes.find(
        (r) =>
          r.originPlaceId === activeOriginId &&
          r.destinationPlaceId === destinationPlaceId &&
          r.deletedAt === null &&
          places.options.some((o) => o.routeId === r.id && o.deletedAt === null),
      ) ?? null
    );
  }, [places.routes, places.options, activeOriginId, destinationPlaceId]);

  // Opções de ônibus cadastradas nesta rota
  const routeBusOptions = useMemo(() => {
    if (!activeRoute) return [];
    return places.options.filter(
      (o) => o.routeId === activeRoute.id && o.kind === "bus" && o.deletedAt === null,
    );
  }, [places.options, activeRoute]);

  // Constrói entrada do cálculo de candidatos
  const gotoInput = useMemo(() => {
    if (!activeRoute || !scheduleData) return null;
    return buildGotoInputFromSources(
      {
        route: activeRoute,
        options: places.options,
        walkTimes: places.walkTimes,
        observations: registro.observations,
        rides: registro.rides,
        schedule: scheduleData,
      },
      instant,
    );
  }, [
    activeRoute,
    places.options,
    places.walkTimes,
    registro.observations,
    registro.rides,
    scheduleData,
    instant,
  ]);

  // Cartões de saída calculados pelo domínio
  const cards = useMemo(() => {
    if (!gotoInput) return [];
    return gotoCards(gotoInput);
  }, [gotoInput]);

  // Informações de caso sem serviço (T-50)
  const noService = useMemo(() => {
    if (cards.length > 0 || !activeRoute || routeBusOptions.length === 0 || !scheduleData) {
      return null;
    }
    const wall = lisbonWallClock(instant);
    const patternIds = routeBusOptions
      .map((o) => {
        const bp = o.boardPatternStopId ? scheduleData.patternStopById.get(o.boardPatternStopId) : null;
        return bp?.patternId;
      })
      .filter((pid): pid is string => Boolean(pid));

    const boardPositions = new Map<string, number>();
    for (const o of routeBusOptions) {
      if (!o.boardPatternStopId) continue;
      const bp = scheduleData.patternStopById.get(o.boardPatternStopId);
      if (bp) boardPositions.set(bp.patternId, bp.position);
    }

    return resolveGotoNoService({
      patternIds,
      tripsToday: gotoInput?.trips ?? [],
      nowMinute: wall.minute,
      serviceDate: wall.date,
      schedule: scheduleData,
      boardPositions,
    });
  }, [cards.length, activeRoute, routeBusOptions, scheduleData, instant, gotoInput]);

  // Troca de origem pelo usuário
  const handleSelectOrigin = async (newOriginId: string) => {
    setUserSelectedOriginId(newOriginId);
    setIsChoosingOrigin(false);
    // Atualiza preferência na tabela setting (D-175)
    await places.setGotoLastOrigin(destinationPlaceId, newOriginId);
  };

  const lastIndex = useRef<number | null>(null);
  const onChange = useCallback((index: number) => {
    if (lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
    lastIndex.current = index;
    setDetent(index === 0 ? 0 : index === 1 ? 1 : 2);
  }, []);

  const small =
    handleHeight > 0 && firstCardHeight > 0
      ? Math.min(
          handleHeight + headerHeight + firstCardHeight + insets.bottom + space.md,
          window.height * SMALL_MAX_SHARE,
        )
      : SMALL_FALLBACK;

  const detents = useMemo<StackedDetents>(
    () => ({
      snapPoints: [small, "50%", "90%"],
      initialIndex: START_INDEX,
      Handle: GotoHandle,
      onChange,
      enableContentPanningGesture: false,
    }),
    [small, onChange],
  );

  const context = useMemo(() => ({ detent, setHandleHeight }), [detent]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(
        detents.snapPoints,
        containerHeightOf(window.height, insets.top),
        handleHeight,
      )[0]?.scrollAreaHeight ?? 0,
    ),
  );

  const openAhead = (tripId: string, position: number) => {
    dispatch({
      type: "push",
      sheet: { kind: "ahead", tripId, position },
    });
  };

  // Renderização de cartão de ônibus
  const renderBusCard = (card: BusCandidate, isFirst: boolean) => {
    const busOpt = routeBusOptions.find((o) => o.id === card.optionId);
    const pattern = scheduleData?.patterns.find((p) => p.id === card.patternId);
    const lineInfo = pattern ? scheduleData?.patternLine.get(pattern.id) : undefined;

    const boardStopInfo = busOpt?.boardPatternStopId
      ? scheduleData?.patternStopById.get(busOpt.boardPatternStopId)
      : undefined;
    const boardStopName = boardStopInfo
      ? scheduleData?.stopNames.get(boardStopInfo.stopId) ?? ""
      : "";

    const a11yLabel = t("sheet_goto.a11y.bus_card", {
      leave: clockText(card.leaveAt),
      be_at: clockText(card.beAtStop),
      arrive: clockText(card.arriveAt),
      until: clockText(card.until),
      line: lineInfo?.code ?? "",
      stop: boardStopName,
    });

    const boardPos = boardStopInfo?.position ?? 1;
    const trip = scheduleData?.trips.find((t) => t.id === card.tripId);
    const cardAlarm = trip ? alarmOfCard(card, alarms, trip, boardPos) : undefined;
    const isAlarmOn = cardAlarm !== undefined;

    const handleToggleAlarm = async () => {
      const db = getSharedDb();
      if (!db || !trip) return;
      if (isAlarmOn && cardAlarm) {
        // Desligar
        await sharedAlarms(db).deleteAlarm(cardAlarm.id, realNow());
        requestReschedule();
        await loadAlarms();
        toast.show({
          title: t("toast.alarm_cancelled.title"),
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              try {
                const saveResult = await sharedAlarms(db).saveAlarm(alarmFromRow(cardAlarm), realNow());
                requestReschedule();
                await loadAlarms();
                if (saveResult.replaced.length > 0) {
                  const rep = saveResult.replaced[0]!;
                  const oldAlarm = alarms.find((a) => a.id === rep.alarmId);
                  const repDays =
                    rep.weekdays.length > 0
                      ? rep.weekdays.map((d) => t(weekdayPluralKey(d))).join(" ")
                      : t("alarm.repeat.once");
                  const repTime = oldAlarm ? formatServiceMinute(oldAlarm.anchorBaseMinute) : "";
                  toast.show({
                    title: t("toast.alarm_replaced", { time: repTime, days: repDays }),
                    action: {
                      label: t("toast.action.undo"),
                      run: async () => {
                        try {
                          await saveResult.undo(realNow());
                          requestReschedule();
                          await loadAlarms();
                        } catch {
                          toast.show({
                            title: t("alarms.undo_failed"),
                            kind: "error",
                          });
                        }
                      },
                    },
                  });
                }
              } catch {
                toast.show({
                  title: t("alarms.undo_failed"),
                  kind: "error",
                });
              }
            },
          },
        });
        return;
      }

      // Ligar
      // 1. Relógio de teste ligado (D-095)
      if (testClock.chosen !== null) {
        toast.show({
          title: t("alarm.test_clock"),
          kind: "error",
        });
        return;
      }

      // 2. Permissão
      const ask = async () => {
        const askCtrl = createAskController();
        dispatch({
          type: "push",
          sheet: {
            kind: "alarmIntro",
            mode: "reason",
            onResolve: (accepted: boolean) => askCtrl.resolve(accepted),
          },
        });
        return askCtrl.wait();
      };
      const perm = await ensureAlarmPermission(expoPort, { ask });
      if (perm === "denied") {
        dispatch({
          type: "push",
          sheet: { kind: "alarmIntro", mode: "denied" },
        });
        return;
      }
      if (perm !== "granted") {
        return;
      }

      // 3. Gravar
      const wall = lisbonWallClock(instant);
      const newAlarmInput = alarmFromCard(card, trip, boardPos, wall.date);
      const saveResult = await sharedAlarms(db).saveAlarm(newAlarmInput, realNow());
      await loadAlarms();

      if (saveResult.replaced.length > 0) {
        const rep = saveResult.replaced[0]!;
        const oldAlarm = alarms.find((a) => a.id === rep.alarmId);
        const repDays = rep.weekdays.length > 0
          ? rep.weekdays.map((d) => t(weekdayPluralKey(d))).join(" ")
          : t("alarm.repeat.once");
        const repTime = oldAlarm ? formatServiceMinute(oldAlarm.anchorBaseMinute) : "";
        toast.show({
          title: t("toast.alarm_replaced", { time: repTime, days: repDays }),
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              try {
                await saveResult.undo(realNow());
                requestReschedule();
                await loadAlarms();
              } catch {
                toast.show({
                  title: t("alarms.undo_failed"),
                  kind: "error",
                });
              }
            },
          },
        });
      } else {
        toast.show({
          title: t("toast.alarm_set.title"),
          body: t("toast.alarm_set.body", { time: clockText(card.leaveAt), line: lineInfo?.code ?? "" }),
          haptic: "success",
        });
      }

      // 4. Reagendar
      requestReschedule();

      // 5. Orientação do modo Foco, uma vez
      const shown = await hasShownAlarmFocusHint(db);
      if (!shown) {
        await markAlarmFocusHintShown(db, realNow());
        dispatch({
          type: "push",
          sheet: { kind: "alarmIntro", mode: "focus" },
        });
      }
    };

    return (
      <View
        key={`${card.tripId}-${card.optionId}`}
        onLayout={isFirst ? (e) => setFirstCardHeight(e.nativeEvent.layout.height) : undefined}
        style={[styles.busCard, { backgroundColor: colors.fill }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          onPress={() => openAhead(card.tripId, boardPos)}
          style={({ pressed }) => [styles.cardTop, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.cardMain}>
            {/* Cabeçalho do cartão: Linha + sair às + chegada */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardBadgeWrap}>
                <LineBadge code={lineInfo?.code ?? ""} color={lineInfo?.color ?? colors.accent} />
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {`${t("sheet_goto.leave_at")} ${clockText(card.leaveAt)}`}
                </Text>
              </View>
              <View style={styles.arriveWrap}>
                <Text style={[type.bodyStrong, { color: colors.accent }]}>
                  {`${t("sheet_goto.arrive_label")} ~${clockText(card.arriveAt)}`}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("sheet_goto.arrive_worst_case", { time: clockText(card.until) })}
                </Text>
              </View>
            </View>

            {/* Subtítulo: no ponto HH:MM · Ponto de embarque */}
            <View style={styles.cardFooterRow}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("sheet_goto.stop_at", {
                  time: clockText(card.beAtStop),
                  stop_name: boardStopName,
                })}
              </Text>
            </View>
          </View>
          <ChevronRightGlyph color={colors.textSecondary} />
        </Pressable>

        {/* Linha com botão "Avisar para sair" e "Repetir" (Item 2) */}
        <View style={styles.cardAlarmRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isAlarmOn }}
            accessibilityLabel={
              isAlarmOn
                ? t("sheet_goto.alarm.active_button", { time: clockText(card.leaveAt) })
                : t("sheet_goto.alarm.set_button")
            }
            onPress={() => void handleToggleAlarm()}
            style={({ pressed }) => [
              styles.alarmButton,
              isAlarmOn
                ? { backgroundColor: colors.accent }
                : { borderColor: colors.divider, borderWidth: 1, backgroundColor: "transparent" },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[type.label, { color: isAlarmOn ? colors.onAccent : colors.text }]}>
              {isAlarmOn
                ? t("sheet_goto.alarm.active_button", { time: clockText(card.leaveAt) })
                : t("sheet_goto.alarm.set_button")}
            </Text>
          </Pressable>

          {isAlarmOn && cardAlarm ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("alarm.repeat.title")}, ${alarmSummary(cardAlarm.weekdays, cardAlarm.validTo)}`}
              onPress={() =>
                dispatch({
                  type: "push",
                  sheet: { kind: "repeat", alarmId: cardAlarm.id },
                })
              }
              style={styles.repeatButton}
            >
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {alarmSummary(cardAlarm.weekdays, cardAlarm.validTo)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  // Renderização de cartão a pé
  const renderWalkCard = (card: WalkCandidate, isFirst: boolean) => {
    const walkMin = Math.max(1, card.arriveAt - card.leaveAt);
    const a11yLabel = t("sheet_goto.a11y.walk_card", {
      leave: clockText(card.leaveAt),
      arrive: clockText(card.arriveAt),
    });

    return (
      <View
        key={`walk-${card.optionId}`}
        accessibilityRole="text"
        accessibilityLabel={a11yLabel}
        onLayout={isFirst ? (e) => setFirstCardHeight(e.nativeEvent.layout.height) : undefined}
        style={[styles.card, { backgroundColor: colors.fill }]}
      >
        <View style={styles.cardMain}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardBadgeWrap}>
              <WalkingGlyph color={colors.textSecondary} size={20} />
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("sheet_goto.walk_option", { minutes: walkMin })}
              </Text>
            </View>
            <View style={styles.arriveWrap}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {`${t("sheet_goto.arrive_label")} ~${clockText(card.arriveAt)}`}
              </Text>
            </View>
          </View>
          <View style={styles.cardFooterRow}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {`${t("sheet_goto.leave_now")} · ${clockText(card.leaveAt)}`}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const otherPlaces = places.places.filter(
    (p) => p.id !== destinationPlaceId && p.deletedAt === null,
  );

  return (
    <GotoSheetContext.Provider value={context}>
      <StackedSheet id={id} detents={detents}>
        <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + space.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cabeçalho */}
            <View
              collapsable={false}
              onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
              style={styles.header}
            >
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("sheet_goto.title", {
                  destination: destinationPlace?.name ?? "",
                })}
              </Text>

              {/* Seletor de origem */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("sheet_goto.origin_change")}: ${originPlace?.name ?? ""}`}
                onPress={() => setIsChoosingOrigin((v) => !v)}
                hitSlop={space.xs}
                style={[styles.originSelector, { backgroundColor: colors.fill }]}
              >
                <PlaceIconGlyph icon={originPlace?.icon} color={colors.accent} size={16} />
                <Text style={[type.body, { color: colors.text }]}>
                  {`${t("sheet_goto.origin_label", { origin: originPlace?.name ?? "" })} ▾`}
                </Text>
              </Pressable>
            </View>

            {/* Menu expansível de seleção de origem */}
            {isChoosingOrigin && (
              <View style={[styles.originMenu, { backgroundColor: colors.surface }]}>
                <Text style={[type.caption, { color: colors.textSecondary, marginBottom: 4 }]}>
                  {t("sheet_goto.origin_select_title")}
                </Text>
                {otherPlaces.map((p) => {
                  const isSelected = p.id === activeOriginId;
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      onPress={() => void handleSelectOrigin(p.id)}
                      style={[
                        styles.originMenuItem,
                        isSelected && { backgroundColor: colors.fill },
                      ]}
                    >
                      <PlaceIconGlyph icon={p.icon} color={colors.accent} size={18} />
                      <Text
                        style={[
                          type.body,
                          { color: isSelected ? colors.accent : colors.text },
                          isSelected && { fontWeight: "600" },
                        ]}
                      >
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Mensagem sem rota cadastrada */}
            {!activeRoute || (routeBusOptions.length === 0 && cards.length === 0 && !noService) ? (
              <View style={styles.emptyCard}>
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("route.no_options")}
                </Text>
                {activeOriginId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("route.add_option")}
                    onPress={() => {
                      if (activeRoute) {
                        const rId = activeRoute.id;
                        dispatch({
                          type: "push",
                          sheet: { kind: "option", routeId: rId },
                        });
                      } else {
                        dispatch({
                          type: "push",
                          sheet: {
                            kind: "option",
                            originPlaceId: activeOriginId,
                            destinationPlaceId,
                          },
                        });
                      }
                    }}
                    style={[styles.addOptionButton, { backgroundColor: colors.fill }]}
                  >
                    <PlusGlyph color={colors.text} />
                    <Text style={[type.bodyStrong, { color: colors.text }]}>
                      {t("route.add_option")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Caso sem serviço (T-50) */}
            {noService ? (
              <View style={[styles.noServiceCard, { backgroundColor: colors.fill }]}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{noService.reason}</Text>
                {noService.nextServiceText ? (
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {noService.nextServiceText}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Lista de cartões ao vivo */}
            {cards.length > 0 ? (
              <View style={styles.cardsList}>
                {/* 1º Cartão (sempre visível e medido para o detent pequeno) */}
                {cards[0]?.kind === "bus"
                  ? renderBusCard(cards[0], true)
                  : renderWalkCard(cards[0] as WalkCandidate, true)}

                {/* Cartões subsequentes (fora da leitura do VoiceOver quando no detent pequeno) */}
                {cards.length > 1 ? (
                  <View
                    accessibilityElementsHidden={detent === 0}
                    importantForAccessibility={detent === 0 ? "no-hide-descendants" : "auto"}
                    style={styles.cardsSubsequent}
                  >
                    {cards.slice(1).map((card) =>
                      card.kind === "bus" ? renderBusCard(card, false) : renderWalkCard(card, false),
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            <HiddenBelowSpacer snapPoints={detents.snapPoints} />
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </GotoSheetContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  header: {
    gap: space.xs,
    paddingTop: space.xs,
  },
  originSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  originMenu: {
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  originMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    minHeight: minTouch,
  },
  cardsList: {
    gap: space.sm,
  },
  cardsSubsequent: {
    gap: space.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    minHeight: 64,
  },
  busCard: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    gap: space.xs,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardAlarmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.xs,
  },
  alarmButton: {
    minHeight: minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  repeatButton: {
    minHeight: minTouch,
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  cardMain: {
    flex: 1,
    gap: 4,
    paddingRight: space.sm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  arriveWrap: {
    alignItems: "flex-end",
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noServiceCard: {
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  emptyCard: {
    paddingVertical: space.md,
    gap: space.sm,
  },
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
});
