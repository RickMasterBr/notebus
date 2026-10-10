/**
 * TL-11 Linhas e pontos (E-08 Bloco 1c, Item 3).
 * Lista agrupada em duas seções (Linhas e Pontos) num só BottomSheetFlatList.
 * Moldura da RecordsSheet (D-150, altura fixa, sem BottomSheetView).
 */
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSchedule } from "../data/ScheduleProvider";
import { officialTag, stopSecondary } from "../data/networkView";
import {
  type NetworkLineItem,
  type NetworkStopItem,
  listLines,
  listStops,
} from "../db/networkList";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

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
  | { type: "line"; id: string; line: NetworkLineItem }
  | { type: "stop"; id: string; stop: NetworkStopItem };

export function NetworkSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const handleClose = useCloseSheet();
  const schedule = useSchedule();
  const db = getSharedDb();

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

  const renderItem = useCallback(
    ({ item }: { item: NetworkListItem }) => {
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
              <View style={styles.nameAndTag}>
                <Text style={[type.body, { color: colors.text, flexShrink: 1 }]}>{line.name}</Text>
                {officialTag(line.source) && (
                  <View style={[styles.officialTag, { backgroundColor: colors.fill }]}>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      {t("net.official")}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{patternText}</Text>
            </View>
          </Pressable>
        );
      }

      if (item.type === "stop") {
        const stop = item.stop;
        const secondary = stopSecondary(stop);
        const a11yLabel = t("net.stop.a11y", { name: stop.name });

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            onPress={() => handleStopPress(stop.id, stop.name)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.divider },
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowContent}>
              <View style={styles.nameAndTag}>
                <Text style={[type.body, { color: colors.text, flexShrink: 1 }]}>{stop.name}</Text>
                {officialTag(stop.source) && (
                  <View style={[styles.officialTag, { backgroundColor: colors.fill }]}>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      {t("net.official")}
                    </Text>
                  </View>
                )}
              </View>
              {secondary ? (
                <Text style={[type.caption, { color: colors.textSecondary }]}>{secondary}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      }

      return null;
    },
    [colors, handleLinePress, handleStopPress],
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
  nameAndTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  officialTag: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: 4,
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
