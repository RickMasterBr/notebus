/**
 * TL-11 Linhas e pontos (E-08 Bloco 1c, Item 3).
 * Lista agrupada em duas seções (Linhas e Pontos) num só BottomSheetFlatList.
 * Moldura da RecordsSheet (D-150, altura fixa, sem BottomSheetView).
 */
import { BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { useSchedule, useScheduleReload } from "../data/ScheduleProvider";
import { useReloadStopIndex } from "../data/StopIndexProvider";
import { useToast } from "../data/ToastProvider";
import { officialTag, stopSecondary } from "../data/networkView";
import { networkEmpty } from "../data/emptyStates";
import { NEW_LINE_ID } from "../data/lineForm";
import { lineDeleteRefusalText } from "../data/lineManage";
import { NEW_STOP_ID } from "../data/stopEdit";
import { deleteRefusalText, isDeleteAction } from "../data/stopManage";
import { isSearching, matchStops, sliceStopsPage, stopsAnchorIndex, type StopsPageView } from "../data/stopsPaging";
import {
  type NetworkLineItem,
  type NetworkStopItem,
  listLines,
  listStops,
} from "../db/networkList";
import { deleteLine } from "../db/lineDelete";
import { getSharedDb } from "../db/sharedDb";
import { deleteStop } from "../db/stopDelete";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, SearchGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { pillStyles } from "../ui/SearchPill";
import { Skeleton } from "../ui/Skeleton";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { pressedStyle } from "../ui/pressed";

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
  | { type: "newLine"; id: string }
  | { type: "newStop"; id: string }
  | { type: "stopSearch"; id: string }
  | { type: "stopPager"; id: string }
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
  const listRef = useRef<React.ComponentRef<typeof BottomSheetFlatList>>(null);
  const keyboardHeight = useKeyboardHeight();

  const [handleHeight, setHandleHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lines, setLines] = useState<NetworkLineItem[]>([]);
  const [stops, setStops] = useState<NetworkStopItem[]>([]);
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);

  const searching = useMemo(() => isSearching(term), [term]);
  const matchedStops = useMemo(() => matchStops(stops, term), [stops, term]);
  const stopsView = useMemo(
    () => sliceStopsPage({ matched: matchedStops, page, searching }),
    [matchedStops, page, searching],
  );

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
    const empty = networkEmpty({ stopCount: stops.length, lineCount: lines.length });

    // Seção Linhas
    items.push({
      type: "header",
      id: "header-lines",
      title: t("net.section.lines"),
    });

    items.push({ type: "newLine", id: "new-line" });

    if (empty.lines) {
      items.push({
        type: "empty",
        id: "empty-lines",
        message: t(empty.lines),
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

    if (stops.length > 0) {
      items.push({ type: "stopSearch", id: "stop-search" });
    }

    items.push({ type: "newStop", id: "new-stop" });

    if (stopsView.showPager) {
      items.push({ type: "stopPager", id: "stop-pager-top" });
    }

    if (empty.stops) {
      items.push({
        type: "empty",
        id: "empty-stops",
        message: t(empty.stops),
      });
    } else if (stopsView.showNoMatch) {
      items.push({
        type: "empty",
        id: "empty-stops-search",
        message: t("net.stops.no_match"),
      });
    } else {

      for (const stop of stopsView.items) {
        items.push({
          type: "stop",
          id: `stop-${stop.id}`,
          stop,
        });
      }
    }

    if (stopsView.showPager) {
      items.push({ type: "stopPager", id: "stop-pager-bottom" });
    }

    return items;
  }, [lines, stops, stopsView]);

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

  const handleNewLinePress = useCallback(() => {
    dispatch({ type: "push", sheet: { kind: "lineDetail", lineId: NEW_LINE_ID } });
  }, [dispatch]);

  const handleNewStopPress = useCallback(() => {
    dispatch({ type: "push", sheet: { kind: "stopEdit", stopId: NEW_STOP_ID } });
  }, [dispatch]);

  const handleTermChange = useCallback((text: string) => {
    activeSwipeable.current?.close();
    setTerm(text);
    setPage(0);
  }, []);

  const handlePrev = useCallback(() => {
    activeSwipeable.current?.close();
    const newPage = stopsView.page - 1;
    setPage(stopsView.page - 1);
    const nextView = sliceStopsPage({ matched: matchedStops, page: newPage, searching });
    AccessibilityInfo.announceForAccessibility(
      t("net.stops.range", { from: nextView.from, to: nextView.to, total: nextView.total }),
    );
    listRef.current?.scrollToIndex({ index: stopsAnchorIndex(listItems), animated: false });
  }, [stopsView.page, matchedStops, searching, listItems]);

  const handleNext = useCallback(() => {
    activeSwipeable.current?.close();
    const newPage = stopsView.page + 1;
    setPage(stopsView.page + 1);
    const nextView = sliceStopsPage({ matched: matchedStops, page: newPage, searching });
    AccessibilityInfo.announceForAccessibility(
      t("net.stops.range", { from: nextView.from, to: nextView.to, total: nextView.total }),
    );
    listRef.current?.scrollToIndex({ index: stopsAnchorIndex(listItems), animated: false });
  }, [stopsView.page, matchedStops, searching, listItems]);

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

  const handleDeleteLine = useCallback(
    async (item: NetworkLineItem) => {
      if (!db) return;
      const result = await deleteLine(db, item.id, now());
      if (!result.ok) {
        const text = lineDeleteRefusalText(result.reason, "usage" in result ? result.usage : undefined);
        toast.show({ title: t(text.key, text.params), kind: "error", haptic: "error" });
        return;
      }
      await reloadAll();
      toast.show({
        title: t("line_delete.done"),
        haptic: "success",
        action: {
          label: t("toast.action.undo"),
          run: async () => {
            const undone = await result.undo(now());
            await reloadAll();
            if (!undone.ok) {
              toast.show({ title: t("line_create.error.stale"), kind: "error", haptic: "error" });
            }
          },
        },
      });
    },
    [db, now, toast, reloadAll],
  );

  const handleStopDelete = useCallback((stop: NetworkStopItem) => { void handleDelete(stop); }, [handleDelete]);
  const handleLineDelete = useCallback((line: NetworkLineItem) => { void handleDeleteLine(line); }, [handleDeleteLine]);

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
      if (item.type === "newLine") {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("net.line.new")}
            onPress={handleNewLinePress}
            style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider }, pressedStyle(pressed)]}
          >
            <Text style={[type.bodyStrong, { color: colors.accent }]}>{`+ ${t("net.line.new")}`}</Text>
          </Pressable>
        );
      }

      if (item.type === "newStop") {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("net.stop.new")}
            onPress={handleNewStopPress}
            style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider }, pressedStyle(pressed)]}
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

      if (item.type === "stopSearch") {
        return (
          <View style={styles.searchContainer}>
            <View style={[pillStyles.pill, styles.searchPill, { backgroundColor: colors.fill }]}>
              <SearchGlyph color={colors.textSecondary} />
              <BottomSheetTextInput
                value={term}
                onChangeText={handleTermChange}
                placeholder={t("net.stops.search_placeholder")}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={t("net.stops.search_placeholder")}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={[type.body, styles.searchInput, { color: colors.text }]}
              />
              {term !== "" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("search.clear.a11y")}
                  hitSlop={space.xs}
                  onPress={() => handleTermChange("")}
                  style={({ pressed }) => [styles.searchClear, pressedStyle(pressed)]}
                >
                  <CrossGlyph color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }

      if (item.type === "stopPager") {
        return (
          <StopsPager
            stopsView={stopsView}
            handlePrev={handlePrev}
            handleNext={handleNext}
          />
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
        return (
          <LineRow
            line={item.line}
            onPress={handleLinePress}
            onDelete={handleLineDelete}
            onWillOpen={handleWillOpen}
            onClose={handleSwipeClose}
          />
        );
      }

      if (item.type === "stop") {
        return (
          <StopRow
            stop={item.stop}
            onPress={handleStopPress}
            onDelete={handleStopDelete}
            onWillOpen={handleWillOpen}
            onClose={handleSwipeClose}
          />
        );
      }

      return null;
    },
    [colors, term, stopsView, handleTermChange, handlePrev, handleNext, handleLinePress, handleStopPress, handleNewStopPress, handleStopDelete, handleLineDelete, handleWillOpen, handleSwipeClose],
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
              style={({ pressed }) => [styles.closeHitTarget, pressedStyle(pressed)]}
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
              ref={listRef}
              data={listItems}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              initialNumToRender={15}
              windowSize={7}
              maxToRenderPerBatch={12}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
              }}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + space.lg + keyboardHeight },
              ]}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const StopRow = memo(function StopRow({
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
          style={({ pressed }) => [styles.deleteButton, { backgroundColor: colors.danger }, pressedStyle(pressed)]}
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
          if (isDeleteAction(event.nativeEvent.actionName)) onDelete(stop);
        }}
        onPress={() => onPress(stop.id, stop.name)}
        style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider, backgroundColor: colors.bg }, pressedStyle(pressed)]}
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
});

const LineRow = memo(function LineRow({
  line,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: {
  line: NetworkLineItem;
  onPress: (lineId: string) => void;
  onDelete: (line: NetworkLineItem) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
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
          accessibilityLabel={t("line_delete.action")}
          onPress={() => {
            swipeableMethods.close();
            onDelete(line);
          }}
          style={({ pressed }) => [styles.deleteButton, { backgroundColor: colors.danger }, pressedStyle(pressed)]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>{t("line_delete.action")}</Text>
        </Pressable>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityActions={[{ name: "delete", label: t("line_delete.action") }]}
        onAccessibilityAction={(event) => {
          if (isDeleteAction(event.nativeEvent.actionName)) onDelete(line);
        }}
        onPress={() => onPress(line.id)}
        style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider, backgroundColor: colors.bg }, pressedStyle(pressed)]}
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
    </ReanimatedSwipeable>
  );
});

function StopsPager({
  stopsView,
  handlePrev,
  handleNext,
}: {
  stopsView: StopsPageView<NetworkStopItem>;
  handlePrev: () => void;
  handleNext: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.pagerContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("net.stops.page_prev.a11y")}
        accessibilityState={{ disabled: !stopsView.hasPrev }}
        disabled={!stopsView.hasPrev}
        onPress={handlePrev}
        style={({ pressed }) => [styles.pagerButton, !stopsView.hasPrev && styles.pagerButtonDisabled, pressedStyle(pressed, !stopsView.hasPrev)]}
      >
        <Text
          style={[
            type.label,
            { color: stopsView.hasPrev ? colors.accent : colors.textSecondary },
            !stopsView.hasPrev && styles.pagerTextDisabled,
          ]}
        >
          {t("net.stops.page_prev")}
        </Text>
      </Pressable>

      <Text style={[type.caption, styles.pagerRange, { color: colors.textSecondary }]}>
        {t("net.stops.range", {
          from: stopsView.from,
          to: stopsView.to,
          total: stopsView.total,
        })}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("net.stops.page_next.a11y")}
        accessibilityState={{ disabled: !stopsView.hasNext }}
        disabled={!stopsView.hasNext}
        onPress={handleNext}
        style={({ pressed }) => [styles.pagerButton, !stopsView.hasNext && styles.pagerButtonDisabled, pressedStyle(pressed, !stopsView.hasNext)]}
      >
        <Text
          style={[
            type.label,
            { color: stopsView.hasNext ? colors.accent : colors.textSecondary },
            !stopsView.hasNext && styles.pagerTextDisabled,
          ]}
        >
          {t("net.stops.page_next")}
        </Text>
      </Pressable>
    </View>
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
  searchContainer: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  searchPill: {
    marginBottom: space.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: space.sm,
  },
  searchClear: {
    width: minTouch,
    height: minTouch,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -space.sm,
  },
  pagerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  pagerButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerButtonDisabled: {
    opacity: 0.4,
  },
  pagerTextDisabled: {
    opacity: 0.5,
  },
  pagerRange: {
    flex: 1,
    textAlign: "center",
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
