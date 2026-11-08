/**
 * TL-08 Registros como tela (D-396, D-414).
 * Quadro de rolagem da E-02 (altura fixa, overflow hidden, BottomSheetFlatList, D-150).
 * Handle sendo a ScreenTopBar com título e fechar.
 */
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useNowTick } from "../data/useNowTick";
import { type RecordListRow, rowTarget } from "../data/recordsList";
import type { LineItemModel, TripCardModel } from "../data/recordsTrips";
import { buildRecordsScreen } from "../data/recordsScreen";
import { type RecordsRow, recordsScreenRows } from "../data/recordsScreenView";
import {
  hide,
  idsToHide,
  pruneRevived,
  unhide,
  visibleObservations,
} from "../data/recordsDelete";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { EmptyState } from "../ui/EmptyState";
import { GroupedRow } from "../ui/GroupedList";
import { LineBadge } from "../ui/LineBadge";
import { ScreenTopBar } from "../ui/ScreenTopBar";
import { TripRecordCard } from "../ui/TripRecordCard";
import { WeekSummaryRow } from "../ui/WeekSummaryRow";
import { PendingSwipeRow } from "./PendingSwipeRow";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";
import { pressedStyle } from "../ui/pressed";
import { hitSlopToMinTouch } from "../ui/touch";

const HeightContext = createContext<(height: number) => void>(() => {});

function RecordsTopBar({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const close = useCloseSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <ScreenTopBar
        title={t("sheet_records.title")}
        onBack={onClose ?? close}
      />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RecordsTopBar };

interface PendingCardViewProps {
  row: RecordListRow;
  onCheck: (row: RecordListRow) => void;
  onDismiss: (row: RecordListRow) => void;
  onDelete: (id: string) => void;
}

const PendingCardView = memo(function PendingCardView({
  row,
  onCheck,
  onDismiss,
  onDelete,
}: PendingCardViewProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("sheet_records.pending.check")}, ${row.stop.name}, ${row.time}`}
      accessibilityActions={[
        { name: "dismiss", label: t("sheet_records.pending.unsure") },
        { name: "delete", label: t("sheet_records.action.delete") },
      ]}
      onAccessibilityAction={(e) => {
        const action = e.nativeEvent.actionName;
        if (action === "dismiss") onDismiss(row);
        if (action === "delete") onDelete(row.id);
      }}
      onPress={() => onCheck(row)}
      style={({ pressed }) => [
        styles.pendingCardContainer,
        { borderColor: colors.accent, backgroundColor: colors.highlight },
        pressedStyle(pressed),
      ]}
    >
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
          hitSlop={hitSlopToMinTouch(36)}
          style={({ pressed }) => [
            styles.pendingButtonCheck,
            { backgroundColor: colors.accent },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
            {t("sheet_records.pending.check")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onDismiss(row)}
          hitSlop={hitSlopToMinTouch(36)}
          style={({ pressed }) => [styles.pendingButtonUnsure, pressedStyle(pressed)]}
        >
          <Text style={[type.bodyStrong, { color: colors.accent }]}>
            {t("sheet_records.pending.unsure")}
          </Text>
        </Pressable>
      </View>
    </Pressable>
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
        style={({ pressed }) => [styles.deleteButton, { backgroundColor: colors.danger }, pressedStyle(pressed)]}
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
          styles.lineCardContainer,
          { backgroundColor: colors.surface, borderColor: colors.divider },
          pressedStyle(pressed),
        ]}
      >
        <View style={styles.lineCardRow}>
          <LineBadge code={item.row.line.code} color={item.row.line.color} />
          <View style={styles.lineCardMain}>
            <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
              {text}
            </Text>
            <Text style={[type.caption, styles.timeText, { color: colors.textSecondary }]}>
              {item.row.time}
            </Text>
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
});

export function RecordsScreen({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const registro = useRegistro();
  const schedule = useSchedule();
  const instant = useNowTick();

  const [handleHeight, setHandleHeight] = useState(0);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  useEffect(() => {
    return () => {
      openSwipeableRef.current = null;
    };
  }, []);

  useEffect(() => {
    setDeletedIds((prev) => pruneRevived(prev, registro.observations));
  }, [registro.observations]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const liveObservations = useMemo(() => {
    return visibleObservations(registro.observations, deletedIds);
  }, [registro.observations, deletedIds]);

  const model = useMemo(() => {
    return buildRecordsScreen({
      observations: liveObservations,
      rides: registro.rides,
      snapshot: scheduleData,
      now: instant,
      lineFilter,
      expandedWeeks,
    });
  }, [liveObservations, registro.rides, scheduleData, instant, lineFilter, expandedWeeks]);

  const rows = useMemo(() => {
    return recordsScreenRows(model, { lineFilter });
  }, [model, lineFilter]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const toggleWeek = useCallback((weekStart: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  }, []);

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

  const handleSwipeableWillOpen = useCallback((methods: SwipeableMethods) => {
    openSwipeableRef.current = openSingleSwipeable(openSwipeableRef.current, methods);
  }, []);

  const handleSwipeableClose = useCallback((methods: SwipeableMethods) => {
    if (openSwipeableRef.current === methods) {
      openSwipeableRef.current = null;
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: RecordsRow }) => {
      if (item.type === "chips") {
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <Chip
              label={t("records.filter.all")}
              selected={lineFilter === null}
              tone="ring"
              onPress={() => setLineFilter(null)}
            />
            {item.lines.map((l) => (
              <Chip
                key={l.code}
                selected={lineFilter === l.code}
                tone="ring"
                onPress={() => setLineFilter((curr) => (curr === l.code ? null : l.code))}
              >
                <LineBadge code={l.code} color={l.color} />
              </Chip>
            ))}
          </ScrollView>
        );
      }

      if (item.type === "sectionHeader") {
        return (
          <View style={styles.sectionHeaderContainer}>
            <Text accessibilityRole="header" style={[type.subtitle, { color: colors.textSecondary }]}>
              {t(item.titleKey as any)}
            </Text>
          </View>
        );
      }

      if (item.type === "now") {
        return (
          <TripRecordCard
            card={item.card}
            isNow
            onPress={() => dispatch({ type: "push", sheet: { kind: "trip" } })}
          />
        );
      }

      if (item.type === "pending") {
        const pendingItem = item.item;
        if (pendingItem.kind === "review") {
          return (
            <PendingSwipeRow
              id={pendingItem.row.id}
              onDelete={handleDeleteSingle}
              onWillOpen={handleSwipeableWillOpen}
              onClose={handleSwipeableClose}
            >
              <PendingCardView
                row={pendingItem.row}
                onCheck={(r) => dispatch({ type: "push", sheet: rowTarget(r) })}
                onDismiss={(r) => void registro.dismissReview(r.id)}
                onDelete={handleDeleteSingle}
              />
            </PendingSwipeRow>
          );
        }
        const card = pendingItem.card;
        return (
          <TripRecordCard
            card={card}
            askAlight
            onPress={() =>
              dispatch({
                type: "push",
                sheet: { kind: "recordTrip", boardingId: card.boardingId },
              })
            }
            onAskAlight={() =>
              dispatch({
                type: "push",
                sheet: { kind: "recordTrip", boardingId: card.boardingId },
              })
            }
          />
        );
      }

      if (item.type === "seeAll") {
        return (
          <GroupedRow
            title={t("records.pending.see_all", { n: item.n })}
            accessory="chevron"
            onPress={() => dispatch({ type: "push", sheet: { kind: "pendingAll" } })}
          />
        );
      }

      if (item.type === "allChecked") {
        return <AllCheckedCardView />;
      }

      if (item.type === "dayHeader") {
        return (
          <View style={styles.dayHeaderContainer}>
            <Text accessibilityRole="header" style={[type.label, { color: colors.textSecondary }]}>
              {item.label}
            </Text>
          </View>
        );
      }

      if (item.type === "trip") {
        return (
          <TripRecordCard
            card={item.card}
            askAlight={item.askAlight}
            onPress={() =>
              dispatch({
                type: "push",
                sheet: { kind: "recordTrip", boardingId: item.card.boardingId },
              })
            }
            onAskAlight={() =>
              dispatch({
                type: "push",
                sheet: { kind: "recordTrip", boardingId: item.card.boardingId },
              })
            }
            onDelete={handleDeleteTrip}
            onWillOpen={handleSwipeableWillOpen}
            onClose={handleSwipeableClose}
          />
        );
      }

      if (item.type === "line") {
        return (
          <LineItemView
            item={item.item}
            onPress={(r) => dispatch({ type: "push", sheet: rowTarget(r) })}
            onDelete={handleDeleteSingle}
            onWillOpen={handleSwipeableWillOpen}
            onClose={handleSwipeableClose}
          />
        );
      }

      if (item.type === "week") {
        return (
          <WeekSummaryRow
            week={item.week}
            expanded={item.expanded}
            onPress={() => toggleWeek(item.week.weekStart)}
          />
        );
      }

      return (
        <EmptyState
          title={t("sheet_records.empty.headline")}
          body={t("sheet_records.empty.body")}
          action={{
            label: t("sheet_records.empty.action_board"),
            onPress: () => dispatch({ type: "push", sheet: { kind: "board", stopId: null } }),
          }}
        />
      );
    },
    [
      colors,
      lineFilter,
      dispatch,
      registro,
      handleDeleteTrip,
      handleDeleteSingle,
      handleSwipeableWillOpen,
      handleSwipeableClose,
      toggleWeek,
    ],
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetFlatList
            data={rows}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            initialNumToRender={12}
            windowSize={7}
            maxToRenderPerBatch={10}
            removeClippedSubviews={false}
            onScrollBeginDrag={() => {
              openSwipeableRef.current = closeAndClearSwipeable(openSwipeableRef.current);
            }}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + space.md },
            ]}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  chipsRow: {
    flexDirection: "row",
    gap: space.xs,
    paddingVertical: space.xs,
  },
  sectionHeaderContainer: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  dayHeaderContainer: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
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
    justifyContent: "flex-end",
  },
  pendingButtonCheck: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingButtonUnsure: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  allCheckedContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  lineCardContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    minHeight: minTouch,
  },
  lineCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  lineCardMain: {
    flex: 1,
    gap: 2,
  },
  timeText: {
    fontVariant: ["tabular-nums"],
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    minHeight: 48,
    paddingHorizontal: space.sm,
  },
});
