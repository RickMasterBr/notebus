/**
 * TL-08 Para conferir completo como tela (D-396, D-414).
 * Lista de todos os itens pendentes (revisões e viagens sem descida).
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
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useNowTick } from "../data/useNowTick";
import { type RecordListRow, rowTarget } from "../data/recordsList";
import { buildRecordsScreen, type RecordsPendingItem } from "../data/recordsScreen";
import {
  hide,
  idsToHide,
  pruneRevived,
  unhide,
  visibleObservations,
} from "../data/recordsDelete";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { LineBadge } from "../ui/LineBadge";
import { ScreenTopBar } from "../ui/ScreenTopBar";
import { TripRecordCard } from "../ui/TripRecordCard";
import { PendingSwipeRow } from "./PendingSwipeRow";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";
import { pressedStyle } from "../ui/pressed";
import { hitSlopToMinTouch } from "../ui/touch";

const HeightContext = createContext<(height: number) => void>(() => {});

function PendingAllTopBar({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const close = useCloseSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <ScreenTopBar
        title={t("sheet_records.section.pending")}
        onBack={onClose ?? close}
      />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: PendingAllTopBar };

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

export function PendingAllScreen({ id }: { id: number }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const registro = useRegistro();
  const schedule = useSchedule();
  const instant = useNowTick();

  const [handleHeight, setHandleHeight] = useState(0);
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
      lineFilter: null,
      expandedWeeks: new Set(),
    });
  }, [liveObservations, registro.rides, scheduleData, instant]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
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
    ({ item }: { item: RecordsPendingItem }) => {
      if (item.kind === "review") {
        return (
          <PendingSwipeRow
            id={item.row.id}
            onDelete={handleDeleteSingle}
            onWillOpen={handleSwipeableWillOpen}
            onClose={handleSwipeableClose}
          >
            <PendingCardView
              row={item.row}
              onCheck={(r) => dispatch({ type: "push", sheet: rowTarget(r) })}
              onDismiss={(r) => void registro.dismissReview(r.id)}
              onDelete={handleDeleteSingle}
            />
          </PendingSwipeRow>
        );
      }

      return (
        <TripRecordCard
          card={item.card}
          askAlight
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
        />
      );
    },
    [
      dispatch,
      registro,
      handleDeleteSingle,
      handleSwipeableWillOpen,
      handleSwipeableClose,
    ],
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetFlatList
            data={model.pending}
            keyExtractor={(item) =>
              item.kind === "review" ? `pending-${item.row.id}` : `pending-no-alight-${item.card.boardingId}`
            }
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
            ListEmptyComponent={<AllCheckedCardView />}
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
});
