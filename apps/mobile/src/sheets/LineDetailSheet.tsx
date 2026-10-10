/**
 * TL-11 Detalhe da linha (E-08 Bloco 1c, Item 4).
 * Exibição só de leitura dos percursos e horários-base da linha.
 * Moldura D-150 (altura fixa, BottomSheetScrollView, sem constante nova).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { type DayTypeCode, dayTypeOf, lisbonWallClock } from "@notebus/domain";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { baseTimes, controlPositions, officialTag } from "../data/networkView";
import {
  type NetworkLineItem,
  type NetworkPatternItem,
  listLines,
  listPatternsOfLine,
} from "../db/networkList";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { CrossGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function LineDetailHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: LineDetailHandle };

const DAY_TYPES: readonly DayTypeCode[] = ["weekday", "saturday", "sunday_holiday"];

export function LineDetailSheet({ id, lineId }: { id: number; lineId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const handleClose = useCloseSheet();
  const scheduleState = useSchedule();
  const now = useNow();
  const db = getSharedDb();

  const [handleHeight, setHandleHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [line, setLine] = useState<NetworkLineItem | null>(null);
  const [patterns, setPatterns] = useState<NetworkPatternItem[]>([]);

  const snapshot = scheduleState.status === "ready" ? scheduleState.data : null;

  const nowMs = now();
  const todayLisbon = useMemo(() => lisbonWallClock(nowMs).date, [nowMs]);
  const defaultDayType: DayTypeCode = useMemo(() => {
    return snapshot ? dayTypeOf(todayLisbon, snapshot.calendar).dayType : "weekday";
  }, [snapshot, todayLisbon]);

  const [selectedDayType, setSelectedDayType] = useState<DayTypeCode>(defaultDayType);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");

  const loadData = useCallback(async () => {
    if (!db) return;
    try {
      const [lines, pts] = await Promise.all([
        listLines(db),
        listPatternsOfLine(db, lineId),
      ]);
      const current = lines.find((l) => l.id === lineId) ?? null;
      setLine(current);
      setPatterns(pts);
      if (pts.length > 0 && !selectedPatternId) {
        setSelectedPatternId(pts[0]!.id);
      }
    } catch {
      setLine(null);
    } finally {
      setLoading(false);
    }
  }, [db, lineId, selectedPatternId]);

  useEffect(() => {
    void loadData();
  }, [scheduleState, loadData]);

  const activePatternId = selectedPatternId || (patterns[0]?.id ?? "");

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const timesResult = useMemo(() => {
    if (!snapshot || !activePatternId) return null;
    return baseTimes({
      snapshot,
      patternId: activePatternId,
      dayType: selectedDayType,
      todayLisbon,
    });
  }, [snapshot, activePatternId, selectedDayType, todayLisbon]);

  const handleStopPress = useCallback(
    (stopId: string, name: string) => {
      dispatch({ type: "push", sheet: { kind: "stop", stopId, name } });
    },
    [dispatch],
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {line ? <LineBadge code={line.code} color={line.color} /> : null}
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[type.title, { color: colors.text, flexShrink: 1 }]}
              >
                {line ? line.name : ""}
              </Text>
              {line && officialTag(line.source) && (
                <View style={[styles.officialTag, { backgroundColor: colors.fill }]}>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("net.official")}
                  </Text>
                </View>
              )}
            </View>
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
          ) : !line ? (
            <View style={styles.emptyContainer}>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {t("net.empty.line")}
              </Text>
            </View>
          ) : (
            <BottomSheetScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: insets.bottom + space.lg },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* Seção Percursos */}
              {patterns.map((pat) => {
                const snapPattern = snapshot?.patterns.find((p) => p.id === pat.id);
                const snapTrips = snapshot?.trips.filter((t) => t.patternId === pat.id) ?? [];
                const cSet = snapPattern
                  ? controlPositions(snapPattern, snapTrips)
                  : new Set<number>();

                const stopsCountText =
                  pat.stops.length === 1
                    ? t("net.pattern.stops_one")
                    : t("net.pattern.stops_other", { n: pat.stops.length });

                return (
                  <View key={pat.id} style={styles.patternSection}>
                    <View style={styles.patternHeader}>
                      <Text
                        accessibilityRole="header"
                        style={[type.title, { color: colors.text }]}
                      >
                        {pat.label}
                      </Text>
                      <View style={styles.patternMetaRow}>
                        {pat.isCircular && (
                          <View style={[styles.metaBadge, { backgroundColor: colors.fill }]}>
                            <Text style={[type.caption, { color: colors.textSecondary }]}>
                              {t("net.pattern.circular")}
                            </Text>
                          </View>
                        )}
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {stopsCountText}
                        </Text>
                      </View>
                    </View>

                    {/* Lista ordenada de paragens */}
                    <View style={styles.stopsList}>
                      {pat.stops.map((stop) => {
                        const isControl =
                          cSet.size > 0 ? cSet.has(stop.position) : stop.isTimepoint;

                        return (
                          <Pressable
                            key={`${pat.id}-${stop.position}`}
                            accessibilityRole="button"
                            accessibilityLabel={t("net.stop.a11y", { name: stop.name })}
                            onPress={() => handleStopPress(stop.stopId, stop.name)}
                            style={({ pressed }) => [
                              styles.stopRow,
                              { borderBottomColor: colors.divider },
                              pressed && styles.rowPressed,
                            ]}
                          >
                            <Text
                              style={[
                                type.bodyStrong,
                                { color: colors.textSecondary, minWidth: 28 },
                              ]}
                            >
                              {stop.position}
                            </Text>
                            <View style={styles.stopNameRow}>
                              <Text style={[type.body, { color: colors.text, flexShrink: 1 }]}>
                                {stop.name}
                              </Text>
                              {isControl && (
                                <Text style={[type.caption, { color: colors.textSecondary }]}>
                                  {t("net.pattern.control")}
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* Seção Horários-base */}
              <View style={styles.timesSection}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {t("net.times.title")}
                </Text>
                {timesResult?.validFrom ? (
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("net.times.valid_from", { date: timesResult.validFrom })}
                  </Text>
                ) : null}

                {/* Seletor de Tipo de Dia */}
                <View style={styles.chipsRow}>
                  <Chip
                    label={t("settings.day.weekday")}
                    selected={selectedDayType === "weekday"}
                    onPress={() => setSelectedDayType("weekday")}
                  />
                  <Chip
                    label={t("settings.day.saturday")}
                    selected={selectedDayType === "saturday"}
                    onPress={() => setSelectedDayType("saturday")}
                  />
                  <Chip
                    label={t("settings.day.sunday_holiday")}
                    selected={selectedDayType === "sunday_holiday"}
                    onPress={() => setSelectedDayType("sunday_holiday")}
                  />
                </View>

                {/* Seletor de Percurso (se houver mais de 1) */}
                {patterns.length > 1 ? (
                  <View style={styles.chipsRow}>
                    {patterns.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.label}
                        selected={activePatternId === p.id}
                        onPress={() => setSelectedPatternId(p.id)}
                      />
                    ))}
                  </View>
                ) : null}

                {/* Horários em {{stop}} */}
                {timesResult?.stopName ? (
                  <Text style={[type.bodyStrong, { color: colors.text }]}>
                    {t("net.times.at", { stop: timesResult.stopName })}
                  </Text>
                ) : null}

                {/* Lista de horas com quebra de linha */}
                {!timesResult || timesResult.times.length === 0 ? (
                  <Text style={[type.body, { color: colors.textSecondary }]}>
                    {t("net.times.empty")}
                  </Text>
                ) : (
                  <View style={styles.timesWrap}>
                    {timesResult.times.map((hour, idx) => (
                      <View
                        key={`${hour}-${idx}`}
                        style={[styles.timeBadge, { backgroundColor: colors.fill }]}
                      >
                        <Text style={[type.body, { color: colors.text }]}>{hour}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Nota de viagens parciais */}
                {timesResult && timesResult.partialCount > 0 ? (
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("net.times.partial_note", { n: timesResult.partialCount })}
                  </Text>
                ) : null}
              </View>
            </BottomSheetScrollView>
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
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
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
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.lg,
  },
  officialTag: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  loadingContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  emptyContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    alignItems: "center",
  },
  patternSection: {
    gap: space.xs,
  },
  patternHeader: {
    gap: 4,
    marginBottom: space.xs,
  },
  patternMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  metaBadge: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stopsList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  stopRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  stopNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  timesSection: {
    gap: space.sm,
    paddingTop: space.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  timesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  timeBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
