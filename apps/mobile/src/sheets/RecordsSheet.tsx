/**
 * TL-08 Registros (E-04 §4.2, UC-14, 4.1 §15a; E-08.5 Bloco 16, D-207).
 * Lista de viagens com cartões, "Agora", "Para conferir", grupos por dia e página de viagem.
 * Quadro de rolagem da E-02 (altura fixa, sem BottomSheetView, D-150).
 * Apagar por deslize à esquerda com Desfazer (D-098, D-052).
 */
import { BottomSheetFlatList, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { lisbonWallClock } from "@notebus/domain";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
import Animated, { FadeIn, SlideInRight } from "react-native-reanimated";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useNowTick } from "../data/useNowTick";
import {
  type RecordListRow,
  rowTarget,
} from "../data/recordsList";
import {
  buildTripsList,
  type LineItemModel,
  type TripCardModel,
} from "../data/recordsTrips";
import {
  recordsHandle,
  recordsNavReduce,
  showHeaderClose,
  type RecordsPage,
} from "../data/recordsNav";
import { tripPageModel } from "../data/recordsTripPage";
import {
  DEFAULT_WINDOW_DAYS,
  hide,
  idsToHide,
  nextWindowDays,
  pruneRevived,
  unhide,
  visibleObservations,
} from "../data/recordsDelete";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { EmptyState } from "../ui/EmptyState";
import {
  AlightGlyph,
  ChevronRightGlyph,
  CrossGlyph,
  InfoGlyph,
  PassGlyph,
} from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";
import { useReduceMotion } from "./useReduceMotion";

const HeightContext = createContext<(height: number) => void>(() => {});

interface RecordsNavContextValue {
  page: RecordsPage;
  onBack: () => void;
}

const RecordsNavContext = createContext<RecordsNavContextValue>({
  page: { kind: "list" },
  onBack: () => {},
});

function RecordsHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const { page, onBack } = useContext(RecordsNavContext);
  const handleInfo = recordsHandle(page);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="close"
        hideCloseButton
        onPress={handleInfo.press === "close" ? onClose : onBack}
      />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RecordsHandle };

type ListItem =
  | { type: "header"; id: string; title: string }
  | { type: "trip"; id: string; card: TripCardModel; isNow?: boolean }
  | { type: "pending"; id: string; row: RecordListRow }
  | { type: "allChecked"; id: string }
  | { type: "line"; id: string; item: LineItemModel };

const RecordHeader = memo(function RecordHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeaderContainer}>
      <Text accessibilityRole="header" style={[type.label, { color: colors.textSecondary }]}>
        {title}
      </Text>
    </View>
  );
});

interface TripCardViewProps {
  card: TripCardModel;
  isNow?: boolean;
  onPress: (card: TripCardModel) => void;
  onDelete: (boardingId: string, alightingId: string | null) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}

const TripCardView = memo(function TripCardView({
  card,
  isNow = false,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: TripCardViewProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleCardPress = useCallback(() => {
    onPress(card);
  }, [card, onPress]);

  const handleDeleteAction = useCallback(
    (methods: SwipeableMethods) => {
      methods.close();
      onDelete(card.boardingId, card.alightingId);
    },
    [card.boardingId, card.alightingId, onDelete],
  );

  const handleAccessibilityDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(card.boardingId, card.alightingId);
  }, [card.boardingId, card.alightingId, onDelete]);

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

  const renderRightActions = useCallback(
    (
      _progress: unknown,
      _translation: unknown,
      swipeableMethods: SwipeableMethods,
    ) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sheet_records.action.delete")}
        onPress={() => handleDeleteAction(swipeableMethods)}
        style={[styles.deleteButton, { backgroundColor: colors.danger }]}
      >
        <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
          {t("sheet_records.action.delete")}
        </Text>
      </Pressable>
    ),
    [colors.danger, handleDeleteAction],
  );

  const routeText =
    card.toName != null
      ? t("sheet_records.trip.route", { from: card.fromName, to: card.toName })
      : t("sheet_records.trip.route_unknown", { from: card.fromName });

  const cardContent = (
    <Pressable
      accessibilityRole="button"
      accessibilityActions={!isNow ? [{ name: "delete", label: t("sheet_records.action.delete") }] : undefined}
      onAccessibilityAction={(event) => {
        if (!isNow && event.nativeEvent.actionName === "delete") {
          handleAccessibilityDelete();
        }
      }}
      accessibilityLabel={card.a11y}
      onPress={handleCardPress}
      style={({ pressed }) => [
        styles.tripCardContainer,
        {
          backgroundColor: isNow ? colors.highlight : colors.surface,
          borderColor: isNow ? colors.accent : colors.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.tripCardRow}>
        <LineBadge code={card.line.code} color={card.line.color} />
        <View style={styles.tripCardMain}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {routeText}
          </Text>
          <Text style={[type.body, styles.timeText, { color: colors.text }]}>
            {card.timeText}
          </Text>
          {card.deltaText != null && (
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {card.deltaText}
            </Text>
          )}
          {card.noAlight && (
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {t("sheet_records.trip.no_alight")}
            </Text>
          )}
        </View>

        <View style={styles.tripCardRight}>
          {isNow ? (
            <View style={[styles.chip, { backgroundColor: colors.highlight, borderColor: colors.accent }]}>
              <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                {t("sheet_records.now.badge")}
              </Text>
            </View>
          ) : card.verifyState === "pending" ? (
            <View style={[styles.chip, { borderColor: colors.accent }]}>
              <InfoGlyph color={colors.accent} />
              <Text style={[type.caption, { color: colors.accent }]}>
                {t("sheet_records.chip.pending")}
              </Text>
            </View>
          ) : card.verifyState === "notVerified" ? (
            <View style={[styles.chip, { borderColor: colors.textSecondary }]}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("sheet_records.chip.not_verified")}
              </Text>
            </View>
          ) : (
            <ChevronRightGlyph color={colors.textSecondary} />
          )}
        </View>
      </View>
    </Pressable>
  );

  if (isNow) {
    return cardContent;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={!isNow ? renderRightActions : undefined}
      overshootRight={false}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleSwipeClose}
    >
      {cardContent}
    </ReanimatedSwipeable>
  );
});

interface PendingCardViewProps {
  row: RecordListRow;
  onCheck: (row: RecordListRow) => void;
  onDismiss: (row: RecordListRow) => void;
}

const PendingCardView = memo(function PendingCardView({
  row,
  onCheck,
  onDismiss,
}: PendingCardViewProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.pendingCardContainer, { borderColor: colors.accent, backgroundColor: colors.highlight }]}>
      <View style={styles.pendingCardHeader}>
        <LineBadge code={row.line.code} color={row.line.color} />
        <View style={styles.pendingCardInfo}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {row.stop.name}
          </Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {row.time}
          </Text>
        </View>
      </View>
      <View style={styles.pendingCardActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onCheck(row)}
          style={[styles.pendingButtonCheck, { backgroundColor: colors.accent }]}
        >
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
            {t("sheet_records.pending.check")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onDismiss(row)}
          style={styles.pendingButtonUnsure}
        >
          <Text style={[type.bodyStrong, { color: colors.accent }]}>
            {t("sheet_records.pending.unsure")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const AllCheckedCardView = memo(function AllCheckedCardView() {
  const { colors } = useTheme();
  return (
    <View style={[styles.allCheckedContainer, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={[type.bodyStrong, { color: colors.text }]}>
        {t("sheet_records.allchecked.headline")}
      </Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>
        {t("sheet_records.allchecked.body")}
      </Text>
    </View>
  );
});

interface LineItemViewProps {
  item: LineItemModel;
  onPress: (row: RecordListRow) => void;
  onDelete: (id: string) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}

const LineItemView = memo(function LineItemView({
  item,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: LineItemViewProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleRowPress = useCallback(() => {
    onPress(item.row);
  }, [item.row, onPress]);

  const handleDeleteAction = useCallback(
    (methods: SwipeableMethods) => {
      methods.close();
      onDelete(item.id);
    },
    [item.id, onDelete],
  );

  const handleAccessibilityDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(item.id);
  }, [item.id, onDelete]);

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

  const renderRightActions = useCallback(
    (
      _progress: unknown,
      _translation: unknown,
      swipeableMethods: SwipeableMethods,
    ) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sheet_records.action.delete")}
        onPress={() => handleDeleteAction(swipeableMethods)}
        style={[styles.deleteButton, { backgroundColor: colors.danger }]}
      >
        <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
          {t("sheet_records.action.delete")}
        </Text>
      </Pressable>
    ),
    [colors.danger, handleDeleteAction],
  );

  const text =
    item.kind === "passed"
      ? t("sheet_records.line.passed", { stop: item.row.stop.name })
      : t("sheet_records.line.alighted", { stop: item.row.stop.name });

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={renderRightActions}
      overshootRight={false}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleSwipeClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityActions={[{ name: "delete", label: t("sheet_records.action.delete") }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") {
            handleAccessibilityDelete();
          }
        }}
        accessibilityLabel={`${text}, ${item.row.time}`}
        onPress={handleRowPress}
        style={({ pressed }) => [
          styles.lineItemContainer,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.divider,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.glyphBox}>
          {item.kind === "passed" ? (
            <PassGlyph color={colors.textSecondary} />
          ) : (
            <AlightGlyph color={colors.textSecondary} />
          )}
        </View>
        <LineBadge code={item.row.line.code} color={item.row.line.color} />
        <Text style={[type.body, styles.lineItemText, { color: colors.text }]} numberOfLines={1}>
          {text}
        </Text>
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          {item.row.time}
        </Text>
      </Pressable>
    </ReanimatedSwipeable>
  );
});

export function RecordsSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const registro = useRegistro();
  const instant = useNowTick();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const reduceMotion = useReduceMotion();

  const [page, dispatchNav] = useReducer(recordsNavReduce, { kind: "list" });
  const handleBack = useCallback(() => dispatchNav({ type: "back" }), []);

  const [handleHeight, setHandleHeight] = useState(0);
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW_DAYS);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  // Limpa referência de swipeable ao desmontar a folha
  useEffect(() => {
    return () => {
      openSwipeableRef.current = null;
    };
  }, []);

  const handleClose = useCallback(() => {
    openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
    close();
  }, [close]);

  // Limpa IDs de deletedIds quando eles reaparecem vivos (ex.: Desfazer)
  useEffect(() => {
    setDeletedIds((prev) => pruneRevived(prev, registro.observations));
  }, [registro.observations]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const liveObservations = useMemo(() => {
    return visibleObservations(registro.observations, deletedIds);
  }, [registro.observations, deletedIds]);

  const model = useMemo(() => {
    return buildTripsList({
      observations: liveObservations,
      rides: registro.rides,
      snapshot: scheduleData,
      now: instant,
      windowDays,
    });
  }, [liveObservations, registro.rides, scheduleData, instant, windowDays]);

  const handleLoadMore = useCallback(() => {
    setWindowDays((curr) => nextWindowDays(model.hasMore, curr));
  }, [model.hasMore]);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    if (model.now) {
      items.push({
        type: "header",
        id: "header-now",
        title: t("sheet_records.section.now"),
      });
      items.push({
        type: "trip",
        id: `now-${model.now.boardingId}`,
        card: model.now,
        isNow: true,
      });
    }

    if (model.pending.length > 0) {
      items.push({
        type: "header",
        id: "header-pending",
        title: t("sheet_records.section.pending"),
      });
      for (const r of model.pending) {
        items.push({
          type: "pending",
          id: `pending-${r.id}`,
          row: r,
        });
      }
    } else if (model.allChecked) {
      items.push({
        type: "allChecked",
        id: "all-checked",
      });
    }

    for (const day of model.days) {
      items.push({
        type: "header",
        id: `header-day-${day.serviceDate}`,
        title: day.label,
      });
      for (const item of day.items) {
        if (item.kind === "trip") {
          items.push({
            type: "trip",
            id: `trip-${item.boardingId}`,
            card: item,
          });
        } else {
          items.push({
            type: "line",
            id: `line-${item.id}`,
            item,
          });
        }
      }
    }

    return items;
  }, [model.now, model.pending, model.allChecked, model.days]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const handleOpenTripPage = useCallback(
    (card: TripCardModel) => {
      dispatchNav({ type: "open", boardingId: card.boardingId });
    },
    [],
  );

  const handleDeleteTrip = useCallback(
    async (boardingId: string, alightingId: string | null) => {
      openSwipeableRef.current = null;
      const ids = idsToHide(boardingId, alightingId);
      setDeletedIds((prev) => hide(prev, ids));
      try {
        await registro.remove(boardingId);
      } catch {
        setDeletedIds((prev) => unhide(prev, ids));
      }
    },
    [registro],
  );

  const handleDeleteSingle = useCallback(
    async (observationId: string) => {
      openSwipeableRef.current = null;
      const ids = idsToHide(observationId);
      setDeletedIds((prev) => hide(prev, ids));
      try {
        await registro.remove(observationId);
      } catch {
        setDeletedIds((prev) => unhide(prev, ids));
      }
    },
    [registro],
  );

  const handleCheckPending = useCallback(
    (row: RecordListRow) => {
      dispatch({ type: "push", sheet: rowTarget(row) });
    },
    [dispatch],
  );

  const handleDismissPending = useCallback(
    (row: RecordListRow) => {
      void registro.dismissReview(row.id);
    },
    [registro],
  );

  const handleLinePress = useCallback(
    (row: RecordListRow) => {
      dispatch({ type: "push", sheet: rowTarget(row) });
    },
    [dispatch],
  );

  const handleOpenBoard = useCallback(() => {
    dispatch({ type: "push", sheet: { kind: "board", stopId: null } });
  }, [dispatch]);

  const handleSwipeableWillOpen = useCallback((methods: SwipeableMethods) => {
    openSwipeableRef.current = openSingleSwipeable(openSwipeableRef.current, methods);
  }, []);

  const handleSwipeableClose = useCallback((methods: SwipeableMethods) => {
    if (openSwipeableRef.current === methods) {
      openSwipeableRef.current = null;
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return <RecordHeader title={item.title} />;
      }
      if (item.type === "trip") {
        return (
          <TripCardView
            card={item.card}
            isNow={item.isNow}
            onPress={handleOpenTripPage}
            onDelete={handleDeleteTrip}
            onWillOpen={handleSwipeableWillOpen}
            onClose={handleSwipeableClose}
          />
        );
      }
      if (item.type === "pending") {
        return (
          <PendingCardView
            row={item.row}
            onCheck={handleCheckPending}
            onDismiss={handleDismissPending}
          />
        );
      }
      if (item.type === "allChecked") {
        return <AllCheckedCardView />;
      }
      return (
        <LineItemView
          item={item.item}
          onPress={handleLinePress}
          onDelete={handleDeleteSingle}
          onWillOpen={handleSwipeableWillOpen}
          onClose={handleSwipeableClose}
        />
      );
    },
    [
      handleOpenTripPage,
      handleDeleteTrip,
      handleCheckPending,
      handleDismissPending,
      handleLinePress,
      handleDeleteSingle,
      handleSwipeableWillOpen,
      handleSwipeableClose,
    ],
  );

  // Modelo da página ativa
  const tripBoardingId = page.kind === "trip" ? page.boardingId : null;
  const tripModel = useMemo(() => {
    if (tripBoardingId == null) return null;
    return tripPageModel({
      boardingId: tripBoardingId,
      observations: liveObservations,
      rides: registro.rides,
      snapshot: scheduleData,
      now: instant,
    });
  }, [tripBoardingId, liveObservations, registro.rides, scheduleData, instant]);

  // Página sem modelo: volta para a lista se o registro sumir
  useEffect(() => {
    if (page.kind === "trip" && tripModel === null) {
      dispatchNav({ type: "back" });
    }
  }, [page.kind, tripBoardingId, tripModel === null]);

  const handleDeleteFromPage = useCallback(async () => {
    if (!tripModel) return;
    try {
      await registro.remove(tripModel.boarding.id);
      dispatchNav({ type: "back" });
    } catch {
      // Se falhar, fica na página
    }
  }, [registro, tripModel]);

  const navContextValue = useMemo(() => ({ page, onBack: handleBack }), [page, handleBack]);

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <RecordsNavContext.Provider value={navContextValue}>
        <StackedSheet id={id} detents={DETENTS}>
          <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
            {/* Cabeçalho */}
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("sheet_records.title")}
              </Text>
              {showHeaderClose(page) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                  onPress={handleClose}
                  style={styles.closeHitTarget}
                >
                  <View style={[styles.closeIconCircle, { backgroundColor: colors.fill }]}>
                    <CrossGlyph color={colors.textSecondary} />
                  </View>
                </Pressable>
              )}
            </View>

            {/* Lista principal */}
            <View
              style={styles.flexOne}
              accessibilityElementsHidden={page.kind === "trip"}
              importantForAccessibility={page.kind === "trip" ? "no-hide-descendants" : "auto"}
            >
              <BottomSheetFlatList
                data={listItems}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                initialNumToRender={12}
                windowSize={7}
                maxToRenderPerBatch={10}
                removeClippedSubviews={false}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                onScrollBeginDrag={() => {
                  openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
                }}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: insets.bottom + space.lg },
                ]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <EmptyState
                    title={t("sheet_records.empty.headline")}
                    body={t("sheet_records.empty.body")}
                    action={{
                      label: t("sheet_records.empty.action_board"),
                      onPress: handleOpenBoard,
                    }}
                  />
                }
              />
            </View>

            {/* Página da viagem sobreposta */}
            {page.kind === "trip" && (
              <Animated.View
                key={page.boardingId}
                entering={reduceMotion ? FadeIn.duration(200) : SlideInRight.duration(280)}
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}
              >
                {tripModel && (
                  <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
                    <BottomSheetScrollView
                      contentContainerStyle={[
                        styles.pageScrollContent,
                        { paddingBottom: insets.bottom + space.lg },
                      ]}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* Botão ‹ Registros */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("sheet_records.back.a11y")}
                        onPress={handleBack}
                        style={styles.backButton}
                      >
                        <View style={{ transform: [{ rotate: "180deg" }] }}>
                          <ChevronRightGlyph color={colors.accent} />
                        </View>
                        <Text style={[type.body, { color: colors.accent, fontWeight: "500" }]}>
                          {t("sheet_records.back")}
                        </Text>
                      </Pressable>

                      {/* Título: Linha + Trecho */}
                      <View style={styles.pageTitleRow}>
                        <LineBadge code={tripModel.line.code} color={tripModel.line.color} />
                        <Text accessibilityRole="header" style={[type.title, { color: colors.text, flex: 1 }]}>
                          {tripModel.toName != null
                            ? t("sheet_records.trip.route", {
                                from: tripModel.fromName,
                                to: tripModel.toName,
                              })
                            : t("sheet_records.trip.route_unknown", {
                                from: tripModel.fromName,
                              })}
                        </Text>
                      </View>

                      {/* Subtítulo: Data e Duração */}
                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {tripModel.durationMin != null
                          ? t("sheet_records.page.subtitle", {
                              day: tripModel.dayLabel,
                              duration: t("sheet_records.trip.duration", { n: tripModel.durationMin }),
                            })
                          : tripModel.dayLabel}
                      </Text>

                      {/* Bloco Embarque e Descida */}
                      <View
                        style={[
                          styles.cardGroup,
                          { borderColor: colors.divider, backgroundColor: colors.surface },
                        ]}
                      >
                        {/* Embarque */}
                        <View
                          style={[
                            styles.pagePointRow,
                            {
                              borderBottomWidth: StyleSheet.hairlineWidth,
                              borderBottomColor: colors.divider,
                            },
                          ]}
                        >
                          <View style={[styles.pointDot, { backgroundColor: colors.accent }]} />
                          <View style={styles.pointInfo}>
                            <Text style={[type.caption, { color: colors.textSecondary }]}>
                              {t("sheet_records.page.boarding")}
                            </Text>
                            <Text style={[type.bodyStrong, { color: colors.text }]}>
                              {tripModel.boarding.time} · {tripModel.boarding.stopName}
                            </Text>
                            {tripModel.boarding.tableTime != null && (
                              <Text style={[type.caption, { color: colors.textSecondary }]}>
                                {tripModel.boarding.delta != null
                                  ? t("sheet_records.page.table_line", {
                                      time: tripModel.boarding.tableTime,
                                      delta: t(tripModel.boarding.delta.key, {
                                        minutes: tripModel.boarding.delta.n,
                                      }),
                                    })
                                  : t("sheet_records.page.table_line_plain", {
                                      time: tripModel.boarding.tableTime,
                                    })}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${t("sheet_records.page.edit")} ${t("sheet_records.page.boarding")}`}
                            onPress={() =>
                              dispatch({
                                type: "push",
                                sheet: { kind: "record", observationId: tripModel.boarding.id },
                              })
                            }
                            style={styles.editHitTarget}
                          >
                            <Text style={[type.bodyStrong, { color: colors.accent }]}>
                              {t("sheet_records.page.edit")}
                            </Text>
                          </Pressable>
                        </View>

                        {/* Descida */}
                        <View style={styles.pagePointRow}>
                          <View style={[styles.pointDotRing, { borderColor: colors.accent }]} />
                          <View style={styles.pointInfo}>
                            <Text style={[type.caption, { color: colors.textSecondary }]}>
                              {t("sheet_records.page.alighting")}
                            </Text>
                            {tripModel.alighting != null ? (
                              <Text style={[type.bodyStrong, { color: colors.text }]}>
                                {tripModel.alighting.time} · {tripModel.alighting.stopName}
                              </Text>
                            ) : (
                              <Text style={[type.body, { color: colors.textSecondary }]}>
                                {tripModel.ongoing
                                  ? t("sheet_records.page.alight_open")
                                  : t("sheet_records.page.alight_missing")}
                              </Text>
                            )}
                          </View>
                          {tripModel.alighting != null && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${t("sheet_records.page.edit")} ${t("sheet_records.page.alighting")}`}
                              onPress={() =>
                                dispatch({
                                  type: "push",
                                  sheet: { kind: "record", observationId: tripModel.alighting!.id },
                                })
                              }
                              style={styles.editHitTarget}
                            >
                              <Text style={[type.bodyStrong, { color: colors.accent }]}>
                                {t("sheet_records.page.edit")}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>

                      {/* Cartão de aprendizado */}
                      <View style={[styles.learnCard, { backgroundColor: colors.highlight }]}>
                        <Text style={[type.body, { color: colors.text }]}>
                          {tripModel.learn === "learns"
                            ? t("sheet_records.page.learns", {
                                line: tripModel.line.code,
                                stop: tripModel.fromName,
                              })
                            : t("sheet_records.page.unmatched")}
                        </Text>
                      </View>

                      {/* Viagem da tabela e Nota */}
                      {(tripModel.originTable != null || tripModel.note != null) && (
                        <View
                          style={[
                            styles.cardGroup,
                            { borderColor: colors.divider, backgroundColor: colors.surface },
                          ]}
                        >
                          {tripModel.originTable != null && (
                            <View
                              style={[
                                styles.tableTripRow,
                                tripModel.note != null && {
                                  borderBottomWidth: StyleSheet.hairlineWidth,
                                  borderBottomColor: colors.divider,
                                },
                              ]}
                            >
                              <Text style={[type.body, { color: colors.text, fontWeight: "500" }]}>
                                {t("sheet_records.page.table_trip")}
                              </Text>
                              <Text style={[type.body, { color: colors.textSecondary }]}>
                                {t("sheet_records.page.table_trip_value", {
                                  time: tripModel.originTable.time,
                                  stop: tripModel.originTable.stopName,
                                })}
                              </Text>
                            </View>
                          )}
                          {tripModel.note != null && (
                            <View style={styles.tableTripRow}>
                              <Text style={[type.body, { color: colors.text, fontWeight: "500" }]}>
                                {t("sheet_records.page.note")}
                              </Text>
                              <Text style={[type.body, { color: colors.textSecondary }]}>
                                {tripModel.note}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Botão Conferir (se verifyId !== null) */}
                      {tripModel.verifyId !== null && (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            dispatch({
                              type: "push",
                              sheet: { kind: "verify", observationId: tripModel.verifyId! },
                            })
                          }
                          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                        >
                          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                            {t("sheet_records.pending.check")}
                          </Text>
                        </Pressable>
                      )}

                      {/* Botão Apagar viagem */}
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleDeleteFromPage}
                        style={[styles.deleteTripButton, { backgroundColor: colors.fill }]}
                      >
                        <Text style={[type.bodyStrong, { color: colors.danger }]}>
                          {t("sheet_records.page.delete")}
                        </Text>
                      </Pressable>
                      <Text
                        style={[
                          type.caption,
                          styles.deleteHintText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {tripModel.deleteKind === "pair"
                          ? t("sheet_records.page.delete_hint")
                          : t("sheet_records.page.delete_hint_single")}
                      </Text>
                    </BottomSheetScrollView>
                  </View>
                )}
              </Animated.View>
            )}
          </View>
        </StackedSheet>
      </RecordsNavContext.Provider>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    marginBottom: space.sm,
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
  listContent: {
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  pageScrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  sectionHeaderContainer: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  tripCardContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    minHeight: minTouch,
  },
  tripCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  tripCardMain: {
    flex: 1,
    gap: 2,
  },
  tripCardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  timeText: {
    fontVariant: ["tabular-nums"],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    minHeight: 48,
    paddingHorizontal: space.sm,
  },
  pendingCardContainer: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: space.md,
    gap: space.sm,
  },
  pendingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  pendingCardInfo: {
    flex: 1,
    gap: 2,
  },
  pendingCardActions: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
  },
  pendingButtonCheck: {
    flex: 1,
    height: minTouch,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingButtonUnsure: {
    height: minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  allCheckedContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  lineItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  glyphBox: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  lineItemText: {
    flex: 1,
  },
  backButton: {
    minHeight: minTouch,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: space.sm,
  },
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  cardGroup: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  pagePointRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    minHeight: 64,
    gap: space.sm,
  },
  pointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pointDotRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  pointInfo: {
    flex: 1,
    gap: 2,
  },
  editHitTarget: {
    minHeight: minTouch,
    minWidth: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  learnCard: {
    borderRadius: radius.md,
    padding: space.md,
  },
  tableTripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  primaryButton: {
    height: minTouch,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteTripButton: {
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteHintText: {
    textAlign: "center",
    marginTop: -space.xs,
  },
});
