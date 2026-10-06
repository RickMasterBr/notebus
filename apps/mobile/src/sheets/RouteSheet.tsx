/**
 * TL-10 Trajeto (D-063, D-064; 4.6 §3.11).
 *
 * Lista de opções de um trajeto na mesma ordem do "Ir para" (gotoCards).
 * Cada opção com linha, descida, tempos a pé e detalhe de horário.
 * Botão "Adicionar opção (ônibus ou a pé)".
 * Apagar opção por swipe com Desfazer no toast (swipeCoordinator).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { type GotoCandidate, gotoCards, lisbonWallClock } from "@notebus/domain";
import { createContext, memo, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { usePlaces } from "../data/PlacesProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useToast } from "../data/ToastProvider";
import { buildGotoInputFromSources } from "../data/gotoData";
import type { ScheduleSnapshot } from "../data/schedule";
import { hhmm, weekdayName } from "../data/testClockPicker";
import type { OptionRow, RouteRow } from "../db/places";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, PlusGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";

const HeightContext = createContext<(height: number) => void>(() => {});

function RouteHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RouteHandle };

interface OptionRowItemProps {
  option: OptionRow;
  card: GotoCandidate | null;
  route: RouteRow;
  scheduleData: ScheduleSnapshot | null;
  getWalkTime: (stopId: string, placeId: string) => { minutesMin: number; minutesMax: number | null } | null;
  onPress: () => void;
  onDelete: (id: string) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}

const OptionRowItem = memo(function OptionRowItem({
  option,
  card,
  route,
  scheduleData,
  getWalkTime,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: OptionRowItemProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleWillOpen = useCallback(() => {
    if (swipeableRef.current) {
      onWillOpen(swipeableRef.current);
    }
  }, [onWillOpen]);

  const handleSwipeClose = useCallback(() => {
    if (swipeableRef.current) {
      onClose(swipeableRef.current);
    }
  }, [onClose]);

  let lineInfo = null;
  let alightStopName = "";
  let walkTo = { min: 0, max: null as number | null };
  let walkFrom = { min: 0, max: null as number | null };

  if (option.kind === "bus" && scheduleData) {
    if (option.boardPatternStopId) {
      const bInfo = scheduleData.patternStopById.get(option.boardPatternStopId);
      if (bInfo) {
        const lId = scheduleData.patternLineId.get(bInfo.patternId);
        if (lId) lineInfo = scheduleData.lineInfo.get(lId);
        const wtTo = getWalkTime(bInfo.stopId, route.originPlaceId);
        if (wtTo) walkTo = { min: wtTo.minutesMin, max: wtTo.minutesMax };
      }
    }
    if (option.alightPatternStopId) {
      const alInfo = scheduleData.patternStopById.get(option.alightPatternStopId);
      if (alInfo) {
        alightStopName = scheduleData.stopNames.get(alInfo.stopId) ?? alInfo.stopId;
        const wtFrom = getWalkTime(alInfo.stopId, route.destinationPlaceId);
        if (wtFrom) walkFrom = { min: wtFrom.minutesMin, max: wtFrom.minutesMax };
      }
    }
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleSwipeClose}
      renderRightActions={(_progress, _translation, swipeableMethods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("option.delete")}
          onPress={() => {
            swipeableMethods.close();
            onDelete(option.id);
          }}
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
            {t("option.delete")}
          </Text>
        </Pressable>
      )}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionCard,
          { backgroundColor: colors.fill },
          pressed && { opacity: 0.8 },
        ]}
      >
        {option.kind === "bus" ? (
          <>
            <View style={styles.optionHeader}>
              {lineInfo ? (
                <LineBadge code={lineInfo.code} color={lineInfo.color} />
              ) : null}
              <Text
                style={[type.bodyStrong, { color: colors.text, flex: 1 }]}
                numberOfLines={1}
              >
                {t("route.option.alight", { stop_name: alightStopName })}
              </Text>
            </View>

            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {t("route.option.walks", {
                to: String(walkTo.min),
                from: String(walkFrom.min),
              })}
            </Text>

            {card ? (
              <Text style={[type.caption, styles.num, { color: colors.text }]}>
                {t("route.option.detail", {
                  leave: hhmm(card.leaveAt),
                  arrive: hhmm(card.arriveAt),
                })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.optionHeader}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("common.walking")}
              </Text>
              <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                {`${option.walkMinutes ?? 0}\u00A0min`}
              </Text>
            </View>
            {card ? (
              <Text style={[type.caption, styles.num, { color: colors.text }]}>
                {t("route.option.walk_detail", {
                  leave: hhmm(card.leaveAt),
                  arrive: hhmm(card.arriveAt),
                })}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
});

export function RouteSheet({ id, routeId }: { id: number; routeId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const now = useNow();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const toast = useToast();
  const schedule = useSchedule();
  const registro = useRegistro();
  const places = usePlaces();
  const [handleHeight, setHandleHeight] = useState(0);
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const route = useMemo(
    () => places.routes.find((r) => r.id === routeId && r.deletedAt === null) ?? null,
    [places.routes, routeId],
  );

  const originPlace = useMemo(
    () => (route ? places.places.find((p) => p.id === route.originPlaceId) ?? null : null),
    [places.places, route],
  );

  const destinationPlace = useMemo(
    () => (route ? places.places.find((p) => p.id === route.destinationPlaceId) ?? null : null),
    [places.places, route],
  );

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const currentClock = lisbonWallClock(now());

  // Constrói GotoInput e obtém os cartões ordenados
  const { orderedItems } = useMemo(() => {
    if (!route || !scheduleData) return { orderedItems: [] };

    const activeOptions = places.options
      .filter((o) => o.routeId === route.id && o.deletedAt === null)
      .sort((a, b) => a.sort - b.sort);

    const gotoInput = buildGotoInputFromSources(
      {
        route,
        options: activeOptions,
        walkTimes: places.walkTimes,
        observations: registro.observations,
        rides: registro.rides,
        schedule: scheduleData,
      },
      now(),
    );

    const cards = gotoInput ? gotoCards(gotoInput) : [];

    // Mapeia opções pelos cards (quem chega antes vem primeiro)
    const cardByOptionId = new Map(cards.map((c) => [c.optionId, c]));

    // Ordena as opções que têm candidato pelo cartão, depois as demais por sort original
    const sorted = [...activeOptions].sort((a, b) => {
      const cardA = cardByOptionId.get(a.id);
      const cardB = cardByOptionId.get(b.id);
      if (cardA && cardB) {
        return cardA.arriveAt - cardB.arriveAt;
      }
      if (cardA) return -1;
      if (cardB) return 1;
      return a.sort - b.sort;
    });

    return {
      orderedItems: sorted.map((opt) => ({
        option: opt,
        card: cardByOptionId.get(opt.id) ?? null,
      })),
    };
  }, [route, scheduleData, places.options, places.walkTimes, registro.observations, registro.rides, now]);

  const handleDeleteOption = useCallback(
    async (optionId: string) => {
      const { token } = await places.removeOption(optionId);
      toast.show({
        title: t("toast.option_deleted.title"),
        action: {
          label: t("toast.action.undo"),
          run: () => places.restoreOption(token),
        },
      });
    },
    [places, toast],
  );

  const handleWillOpenSwipe = useCallback((methods: SwipeableMethods) => {
    openSwipeableRef.current = openSingleSwipeable(openSwipeableRef.current, methods);
  }, []);

  const handleSwipeClose = useCallback((methods: SwipeableMethods) => {
    if (openSwipeableRef.current === methods) {
      openSwipeableRef.current = null;
    }
  }, []);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  if (!route || !originPlace || !destinationPlace) return null;

  const routeTitle = `${originPlace.name} → ${destinationPlace.name}`;
  const routeSubtitle = t("route.subtitle", {
    time: hhmm(currentClock.minute),
    weekday: weekdayName(currentClock.date),
  });

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            onScrollBeginDrag={() => {
              openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
            }}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + space.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cabeçalho */}
            <View style={styles.header}>
              <View style={styles.headerTitles}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {routeTitle}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {routeSubtitle}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                onPress={close}
                style={styles.closeHitTarget}
              >
                <View style={[styles.closeIconCircle, { backgroundColor: colors.fill }]}>
                  <CrossGlyph color={colors.textSecondary} />
                </View>
              </Pressable>
            </View>

            {/* Dica de ordenação */}
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {t("route.order_hint")}
            </Text>

            {/* Lista de opções */}
            <View style={styles.list}>
              {orderedItems.length === 0 ? (
                <Text style={[type.body, { color: colors.textSecondary, paddingVertical: space.md }]}>
                  {t("route.no_options")}
                </Text>
              ) : (
                orderedItems.map(({ option, card }) => (
                  <OptionRowItem
                    key={option.id}
                    option={option}
                    card={card}
                    route={route}
                    scheduleData={scheduleData}
                    getWalkTime={places.getWalkTime}
                    onPress={() => {
                      openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
                      dispatch({
                        type: "push",
                        sheet: { kind: "option", routeId: route.id, optionId: option.id },
                      });
                    }}
                    onDelete={handleDeleteOption}
                    onWillOpen={handleWillOpenSwipe}
                    onClose={handleSwipeClose}
                  />
                ))
              )}
            </View>

            {/* Adicionar opção */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("route.add_option")}
              onPress={() => {
                openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
                dispatch({
                  type: "push",
                  sheet: { kind: "option", routeId: route.id },
                });
              }}
              style={[styles.addButton, { backgroundColor: colors.fill }]}
            >
              <PlusGlyph color={colors.text} />
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("route.add_option")}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  headerTitles: {
    flex: 1,
    gap: 4,
    paddingRight: space.sm,
  },
  closeHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: space.sm,
  },
  optionCard: {
    padding: space.md,
    borderRadius: radius.md,
    gap: space.xs,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  num: {
    fontVariant: ["tabular-nums"],
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 90,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
});
