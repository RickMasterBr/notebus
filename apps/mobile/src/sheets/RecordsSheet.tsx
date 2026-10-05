/**
 * TL-08 Registros (E-04 §4.2, UC-14, 4.1 §15a).
 * Lista virtualizada com histórico por dia e seção "Para conferir".
 * Quadro de rolagem da E-02 (altura fixa, sem BottomSheetView).
 * Apagar por deslize à esquerda com Desfazer (D-098, D-052).
 */
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { lisbonWallClock } from "@notebus/domain";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useNowTick } from "../data/useNowTick";
import {
  buildRecordsList,
  type RecordListRow,
  rowTarget,
} from "../data/recordsList";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { AlightGlyph, BoardGlyph, CrossGlyph, InfoGlyph, PassGlyph, PlusGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";

const HeightContext = createContext<(height: number) => void>(() => {});

function RecordsHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RecordsHandle };

type ListItem =
  | { type: "header"; id: string; title: string }
  | { type: "row"; id: string; row: RecordListRow };

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

interface RecordRowProps {
  row: RecordListRow;
  onPress: (row: RecordListRow) => void;
  onDelete: (id: string) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}

const RecordRow = memo(function RecordRow({
  row,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: RecordRowProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleRowPress = useCallback(() => {
    onPress(row);
  }, [row, onPress]);

  const handleDeleteAction = useCallback(
    (methods: SwipeableMethods) => {
      methods.close();
      onDelete(row.id);
    },
    [row.id, onDelete],
  );

  const handleAccessibilityDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(row.id);
  }, [row.id, onDelete]);

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

  const stateLabel =
    row.verifyState === "pending"
      ? t("sheet_records.row.state_pending")
      : row.verifyState === "notVerified"
        ? t("sheet_records.row.state_not_verified")
        : "";
  const kindLabel =
    row.kind === "boarded"
      ? t("common.kind.boarded.short")
      : row.kind === "alighted"
        ? t("common.kind.alighted.short")
        : row.kind === "passed"
          ? t("common.kind.passed.short")
          : "";

  const a11yLabel = t("sheet_records.row.a11y", {
    time: row.time,
    line: row.line.code,
    stop: row.stop.name,
    kind: kindLabel,
    state: stateLabel,
  });

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
        accessibilityLabel={a11yLabel}
        onPress={handleRowPress}
        style={({ pressed }) => [
          styles.rowContainer,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.divider,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {/* Hora */}
        <Text style={[type.bodyStrong, styles.timeText, { color: colors.text }]}>{row.time}</Text>

        {/* Selo da Linha */}
        <LineBadge code={row.line.code} color={row.line.color} />

        {/* Glifo do tipo */}
        <View style={styles.glyphBox}>
          {row.kind === "boarded" && <BoardGlyph color={colors.textSecondary} />}
          {row.kind === "alighted" && <AlightGlyph color={colors.textSecondary} />}
          {row.kind === "passed" && <PassGlyph color={colors.textSecondary} />}
        </View>

        {/* Nome do Ponto */}
        <Text style={[type.body, styles.stopText, { color: colors.text }]} numberOfLines={1}>
          {row.stop.name}
        </Text>

        {/* Chip de estado */}
        {row.verifyState === "pending" && (
          <View style={[styles.chip, { borderColor: colors.accent }]}>
            <InfoGlyph color={colors.accent} />
            <Text style={[type.caption, { color: colors.accent }]}>{t("sheet_records.chip.pending")}</Text>
          </View>
        )}
        {row.verifyState === "notVerified" && (
          <View style={[styles.chip, { borderColor: colors.textSecondary }]}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t("sheet_records.chip.not_verified")}</Text>
          </View>
        )}
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

  const [handleHeight, setHandleHeight] = useState(0);
  const [windowDays, setWindowDays] = useState(14);
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
    setDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const obsId of prev) {
        const obs = registro.observations.find((o) => o.id === obsId);
        if (obs && obs.deletedAt == null) {
          next.delete(obsId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [registro.observations]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const liveObservations = useMemo(() => {
    if (deletedIds.size === 0) return registro.observations;
    return registro.observations.filter((o) => !deletedIds.has(o.id));
  }, [registro.observations, deletedIds]);

  const nowDay = useMemo(() => lisbonWallClock(instant).date, [instant]);

  const model = useMemo(() => {
    return buildRecordsList(liveObservations, scheduleData, instant, windowDays);
  }, [liveObservations, scheduleData, nowDay, windowDays]);

  const handleLoadMore = useCallback(() => {
    if (model.hasMore) {
      setWindowDays((curr) => curr + 14);
    }
  }, [model.hasMore]);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    if (model.pending.length > 0) {
      items.push({
        type: "header",
        id: "header-pending",
        title: t("sheet_records.section.pending"),
      });
      for (const r of model.pending) {
        items.push({
          type: "row",
          id: `pending-${r.id}`,
          row: r,
        });
      }
    }

    for (const day of model.days) {
      items.push({
        type: "header",
        id: `header-day-${day.serviceDate}`,
        title: day.label,
      });
      for (const r of day.rows) {
        items.push({
          type: "row",
          id: `day-${day.serviceDate}-${r.id}`,
          row: r,
        });
      }
    }

    return items;
  }, [model.pending, model.days]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const handleRowPress = useCallback(
    (row: RecordListRow) => {
      const target = rowTarget(row);
      dispatch({ type: "push", sheet: target });
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    async (observationId: string) => {
      openSwipeableRef.current = null;
      setDeletedIds((prev) => new Set(prev).add(observationId));
      try {
        await registro.remove(observationId);
      } catch {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(observationId);
          return next;
        });
      }
    },
    [registro],
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

      return (
        <RecordRow
          row={item.row}
          onPress={handleRowPress}
          onDelete={handleDelete}
          onWillOpen={handleSwipeableWillOpen}
          onClose={handleSwipeableClose}
        />
      );
    },
    [handleRowPress, handleDelete, handleSwipeableWillOpen, handleSwipeableClose],
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {t("sheet_records.title")}
            </Text>
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
          </View>

          {/* Lista virtualizada */}
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
              <View style={styles.emptyContainer}>
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("sheet_records.empty.title")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenBoard}
                  style={[styles.emptyButton, { backgroundColor: colors.fill }]}
                >
                  <PlusGlyph color={colors.text} />
                  <Text style={[type.bodyStrong, { color: colors.text }]}>
                    {t("sheet_records.empty.action")}
                  </Text>
                </Pressable>
              </View>
            }
          />
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
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
  },
  sectionHeaderContainer: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  timeText: {
    minWidth: 46,
  },
  glyphBox: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stopText: {
    flex: 1,
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xl * 2,
    gap: space.md,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    minHeight: minTouch,
  },
});
