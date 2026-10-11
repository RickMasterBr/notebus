/**
 * TL-11 Linhas e pontos (E-08 Bloco 1c, Item 3).
 * Lista agrupada em duas seções (Linhas e Pontos) num só BottomSheetFlatList.
 * Moldura da RecordsSheet (D-150, altura fixa, sem BottomSheetView).
 */
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { useSchedule, useScheduleReload } from "../data/ScheduleProvider";
import { useReloadStopIndex } from "../data/StopIndexProvider";
import { useToast } from "../data/ToastProvider";
import { officialTag, stopSecondary } from "../data/networkView";
import { NEW_STOP_ID } from "../data/stopEdit";
import { deleteRefusalText } from "../data/stopManage";
import {
  type NetworkLineItem,
  type NetworkStopItem,
  listLines,
  listStops,
} from "../db/networkList";
import { getSharedDb } from "../db/sharedDb";
import { deleteStop } from "../db/stopDelete";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";

const HeightContext = createContext<(height: number) => void>(() => {});

function NetworkHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: NetworkHandle };

type NetworkListItem =
  | { type: "header"; id: string; title: string }
  | { type: "empty"; id: string; message: string }
  | { type: "newStop"; id: string }
  | { type: "line"; id: string; line: NetworkLineItem }
  | { type: "stop"; id: string; stop: NetworkStopItem };

export function NetworkSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const handleClose = useCloseSheet();
  const schedule = useSchedule();
  const reloadSchedule = useScheduleReload();
  const reloadStopIndex = useReloadStopIndex();
  const now = useNow();
  const toast = useToast();
  const db = getSharedDb();
  const activeSwipeable = useRef<SwipeableMethods | null>(null);

  const [handleHeight, setHandleHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lines, setLines] = useState<NetworkLineItem[]>([]);
  const [stops, setStops] = useState<NetworkStopItem[]>([]);

  const loadData = useCallback(async () => {
    if (!db) return;
    try {
      const [l, s] = await Promise.all([listLines(db), listStops(db)]);
      setLines(l);
      setStops(s);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void loadData();
  }, [schedule, loadData]);

  const listItems = useMemo((): NetworkListItem[] => {
    const items: NetworkListItem[] = [];

    // Seção Linhas
    items.push({
      type: "header",
      id: "header-lines",
      title: t("net.section.lines"),
    });

    if (lines.length === 0) {
      items.push({
        type: "empty",
        id: "empty-lines",
        message: t("net.empty.lines"),
      });
    } else {
      for (const line of lines) {
        items.push({
          type: "line",
          id: `line-${line.id}`,
          line,
        });
      }
    }

    // Seção Pontos
    items.push({
      type: "header",
      id: "header-stops",
      title: t("net.section.stops"),
    });

    items.push({ type: "newStop", id: "new-stop" });

    if (stops.length === 0) {
      items.push({
        type: "empty",
        id: "empty-stops",
        message: t("net.empty.stops"),
      });
    } else {
      for (const stop of stops) {
        items.push({
          type: "stop",
          id: `stop-${stop.id}`,
          stop,
        });
      }
    }

    return items;
  }, [lines, stops]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const handleLinePress = useCallback(
    (lineId: string) => {
      dispatch({ type: "push", sheet: { kind: "lineDetail", lineId } });
    },
    [dispatch],
  );

  const handleStopPress = useCallback(
    (stopId: string, name: string) => {
      dispatch({ type: "push", sheet: { kind: "stop", stopId, name } });
    },
    [dispatch],
  );

  const handleNewStopPress = useCallback(() => {
    dispatch({ type: "push", sheet: { kind: "stopEdit", stopId: NEW_STOP_ID } });
  }, [dispatch]);

  // Depois de criar, apagar ou desfazer: a busca, os horários e esta lista leem o banco de novo (como o saveStopEdit).
  const reloadAll = useCallback(async () => {
    await reloadStopIndex();
    await reloadSchedule();
    await loadData();
  }, [reloadStopIndex, reloadSchedule, loadData]);

  const handleDelete = useCallback(
    async (item: NetworkStopItem) => {
      if (!db) return;
      const result = await deleteStop(db, item.id, now());
      if (!result.ok) {
        const text = deleteRefusalText(result.reason, "usage" in result ? result.usage : undefined);
        toast.show({ title: t(text.key, text.params), kind: "error", haptic: "error" });
        return;
      }
      await reloadAll();
      toast.show({
        title: t("stop_delete.done"),
        haptic: "success",
        action: {
          label: t("toast.action.undo"),
          run: async () => {
            const undone = await result.undo(now());
            await reloadAll();
            if (!undone.ok) {
              toast.show({ title: t("stop_edit.error.stale"), kind: "error", haptic: "error" });
            }
          },
        },
      });
    },
    [db, now, toast, reloadAll],
  );

  const handleWillOpen = useCallback((methods: SwipeableMethods) => {
    activeSwipeable.current = openSingleSwipeable(activeSwipeable.current, methods);
  }, []);

  const handleSwipeClose = useCallback((methods: SwipeableMethods) => {
    if (activeSwipeable.current === methods) {
      activeSwipeable.current = closeAndClearSwipeable(activeSwipeable.current);
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: NetworkListItem }) => {
      if (item.type === "newStop") {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("net.stop.new")}
            onPress={handleNewStopPress}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.divider },
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.accent }]}>{`+ ${t("net.stop.new")}`}</Text>
          </Pressable>
        );
      }

      if (item.type === "header") {
        return (
          <View style={styles.sectionHeaderContainer}>
            <Text accessibilityRole="header" style={[type.label, { color: colors.textSecondary }]}>
              {item.title}
            </Text>
          </View>
        );
      }

      if (item.type === "empty") {
        return (
          <View style={styles.emptyRow}>
            <Text style={[type.body, { color: colors.textSecondary }]}>{item.message}</Text>
          </View>
        );
      }

      if (item.type === "line") {
        const line = item.line;
        const patternText =
          line.patternCount === 1
            ? t("net.line.patterns_one")
            : t("net.line.patterns_other", { n: line.patternCount });
        const a11yLabel = t("net.line.a11y", {
          code: line.code,
          name: line.name,
          patterns: patternText,
        });

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            onPress={() => handleLinePress(line.id)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.divider },
              pressed && styles.rowPressed,
            ]}
          >
            <LineBadge code={line.code} color={line.color} />
            <View style={styles.rowContent}>
              <Text style={[type.body, { color: colors.text, flexShrink: 1 }]}>{line.name}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{patternText}</Text>
            </View>
            {officialTag(line.source) && (
              <View style={[styles.officialTag, { backgroundColor: colors.fill }]}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("net.official")}
                </Text>
              </View>
            )}
          </Pressable>
        );
      }

      if (item.type === "stop") {
        return (
          <StopRow
            stop={item.stop}
            onPress={handleStopPress}
            onDelete={(stop) => void handleDelete(stop)}
            onWillOpen={handleWillOpen}
            onClose={handleSwipeClose}
          />
        );
      }

      return null;
    },
    [colors, handleLinePress, handleStopPress, handleNewStopPress, handleDelete, handleWillOpen, handleSwipeClose],
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {t("net.title")}
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

          {loading ? (
            <View style={styles.loadingContainer}>
              <Skeleton rows={8} variant="rows" />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={[type.body, { color: colors.textSecondary }]}>{t("net.error")}</Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={listItems}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              initialNumToRender={15}
              windowSize={7}
              maxToRenderPerBatch={12}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + space.lg },
              ]}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function StopRow({
  stop,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: {
  stop: NetworkStopItem;
  onPress: (stopId: string, name: string) => void;
  onDelete: (stop: NetworkStopItem) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const secondary = stopSecondary(stop);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClose(swipeableRef.current);
      }}
      renderRightActions={(_progress, _translation, swipeableMethods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stop_delete.action")}
          onPress={() => {
            swipeableMethods.close();
            onDelete(stop);
          }}
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>{t("stop_delete.action")}</Text>
        </Pressable>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("net.stop.a11y", { name: stop.name })}
        accessibilityActions={[{ name: "delete", label: t("stop_delete.action") }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") onDelete(stop);
        }}
        onPress={() => onPress(stop.id, stop.name)}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.divider, backgroundColor: colors.bg },
          pressed && styles.rowPressed,
        ]}
      >
        <View style={styles.rowContent}>
          <Text style={[type.body, { color: colors.text, flexShrink: 1 }]}>{stop.name}</Text>
          {secondary ? <Text style={[type.caption, { color: colors.textSecondary }]}>{secondary}</Text> : null}
        </View>
        {officialTag(stop.source) && (
          <View style={[styles.officialTag, { backgroundColor: colors.fill }]}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t("net.official")}</Text>
          </View>
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  deleteButton: {
    minWidth: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.md,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  officialTag: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  emptyRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  loadingContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  errorContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    alignItems: "center",
  },
  listContent: {
    paddingBottom: space.xl,
  },
});
