/**
 * TL-08 Registros (E-04 §4.2, UC-14, 4.1 §15a).
 * Lista virtualizada com histórico por dia e seção "Para conferir".
 * Quadro de rolagem da E-02 (altura fixa, sem BottomSheetView).
 * Apagar por deslize à esquerda com Desfazer (D-098, D-052).
 */
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  const rowRefs = useRef<Map<string, SwipeableMethods>>(new Map());

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

  const model = useMemo(() => {
    return buildRecordsList(liveObservations, scheduleData, instant, windowDays);
  }, [liveObservations, scheduleData, instant, windowDays]);

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

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return (
          <View style={styles.sectionHeaderContainer}>
            <Text accessibilityRole="header" style={[type.label, { color: colors.textSecondary }]}>
              {item.title}
            </Text>
          </View>
        );
      }

      const r = item.row;
      const stateLabel =
        r.verifyState === "pending"
          ? t("sheet_records.row.state_pending")
          : r.verifyState === "notVerified"
            ? t("sheet_records.row.state_not_verified")
            : "";
      const kindLabel =
        r.kind === "boarded"
          ? t("common.kind.boarded.short")
          : r.kind === "alighted"
            ? t("common.kind.alighted.short")
            : t("common.kind.passed.short");

      const a11yLabel = t("sheet_records.row.a11y", {
        time: r.time,
        line: r.line.code,
        stop: r.stop.name,
        kind: kindLabel,
        state: stateLabel,
      });

      const renderRightActions = (
        _progress: unknown,
        _translation: unknown,
        swipeableMethods: SwipeableMethods,
      ) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sheet_records.action.delete")}
          onPress={() => {
            swipeableMethods.close();
            void handleDelete(r.id);
          }}
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
            {t("sheet_records.action.delete")}
          </Text>
        </Pressable>
      );

      return (
        <ReanimatedSwipeable
          key={r.id}
          ref={(el) => {
            if (el) {
              rowRefs.current.set(r.id, el);
            } else {
              rowRefs.current.delete(r.id);
            }
          }}
          onSwipeableWillOpen={() => {
            const currentMethods = rowRefs.current.get(r.id) ?? null;
            openSwipeableRef.current = openSingleSwipeable(openSwipeableRef.current, currentMethods);
          }}
          onSwipeableClose={() => {
            const currentMethods = rowRefs.current.get(r.id);
            if (openSwipeableRef.current === currentMethods) {
              openSwipeableRef.current = null;
            }
          }}
          friction={2}
          enableTrackpadTwoFingerGesture
          rightThreshold={40}
          renderRightActions={renderRightActions}
          overshootRight={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityActions={[{ name: "delete", label: t("sheet_records.action.delete") }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "delete") {
                void handleDelete(r.id);
              }
            }}
            accessibilityLabel={a11yLabel}
            onPress={() => handleRowPress(r)}
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
            <Text style={[type.bodyStrong, styles.timeText, { color: colors.text }]}>{r.time}</Text>

            {/* Selo da Linha */}
            <LineBadge code={r.line.code} color={r.line.color} />

            {/* Glifo do tipo */}
            <View style={styles.glyphBox}>
              {r.kind === "boarded" && <BoardGlyph color={colors.textSecondary} />}
              {r.kind === "alighted" && <AlightGlyph color={colors.textSecondary} />}
              {r.kind === "passed" && <PassGlyph color={colors.textSecondary} />}
            </View>

            {/* Nome do Ponto */}
            <Text style={[type.body, styles.stopText, { color: colors.text }]} numberOfLines={1}>
              {r.stop.name}
            </Text>

            {/* Chip de estado */}
            {r.verifyState === "pending" && (
              <View style={[styles.chip, { borderColor: colors.accent }]}>
                <InfoGlyph color={colors.accent} />
                <Text style={[type.caption, { color: colors.accent }]}>{t("sheet_records.chip.pending")}</Text>
              </View>
            )}
            {r.verifyState === "notVerified" && (
              <View style={[styles.chip, { borderColor: colors.textSecondary }]}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{t("sheet_records.chip.not_verified")}</Text>
              </View>
            )}
          </Pressable>
        </ReanimatedSwipeable>
      );
    },
    [colors, handleDelete, handleRowPress],
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
