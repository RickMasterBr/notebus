/**
 * TL-10 Seletor de Descida (D-065, T-48; 4.6 §3.11).
 *
 * Exibe paragens DEPOIS do embarque no percurso, em ordem.
 * Mostra hora prevista, passagens repetidas ("2ª passagem · segue para ...") e fim de percurso.
 * Quadro de folha da D-150 (altura fixa, sem tall, ✕ único).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { passageInfo, timepointPositions } from "@notebus/domain";
import { createContext, useContext, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSchedule } from "../data/ScheduleProvider";
import { filterAlightStops, formatAlightSubtitle } from "../data/alightSelection";
import { patternStopKey } from "../data/schedule";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";
import { SheetHandle } from "./SheetHandle";
import { useAlightPick } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function AlightPickerHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: AlightPickerHandle };

export function AlightPickerSheet({
  id,
  routeId: _routeId,
  patternId,
  boardPosition,
  currentAlightPatternStopId: _currentAlightPatternStopId,
}: {
  id: number;
  routeId: string;
  patternId: string;
  boardPosition: number;
  currentAlightPatternStopId?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const close = useCloseSheet();
  const alightPick = useAlightPick();
  const [handleHeight, setHandleHeight] = useState(0);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const pattern = useMemo(
    () => scheduleData?.patterns.find((p) => p.id === patternId) ?? null,
    [scheduleData, patternId],
  );

  const lineInfo = useMemo(
    () => (pattern ? scheduleData?.patternLine.get(pattern.id) : null),
    [scheduleData, pattern],
  );

  const boardStopName = useMemo(() => {
    if (!pattern || !scheduleData) return "";
    const bStop = pattern.stops.find((s) => s.position === boardPosition);
    return bStop ? (scheduleData.stopNames.get(bStop.stopId) ?? bStop.stopId) : "";
  }, [pattern, scheduleData, boardPosition]);

  const stopsAfterBoard = useMemo(() => {
    if (!pattern) return [];
    return filterAlightStops(pattern.stops, boardPosition);
  }, [pattern, boardPosition]);

  const timepoints = useMemo(
    () => (pattern && scheduleData ? timepointPositions(pattern, scheduleData.trips) : new Set<number>()),
    [pattern, scheduleData],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  if (!pattern || !scheduleData) return null;

  const handleSelect = (position: number, stopId: string) => {
    const pStopId =
      scheduleData.patternStopIds.get(patternStopKey(patternId, position)) ?? "";
    alightPick.resolve({
      patternStopId: pStopId,
      stopId,
      position,
    });
    close();
  };

  const lineCode = lineInfo?.code ?? "";

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
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
                  {t("alight_picker.title")}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("alight_picker.subtitle", {
                    line: lineCode,
                    stop_name: boardStopName,
                  })}
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

            {/* Lista de paragens depois do embarque */}
            <View style={styles.list}>
              {stopsAfterBoard.map((ps, idx) => {
                const stopName = scheduleData.stopNames.get(ps.stopId) ?? ps.stopId;
                const info = passageInfo(pattern, timepoints, ps.position);
                const isLast = idx === stopsAfterBoard.length - 1;
                const destStop = pattern.stops[pattern.stops.length - 1];
                const destName = destStop ? scheduleData.stopNames.get(destStop.stopId) ?? "" : "";
                const subtitle = formatAlightSubtitle(
                  { passageNumber: info.number, isLast, destinationName: destName },
                  (ord, dest) => t("alight_picker.second_pass", { ordinal: ord, destination: dest }),
                  t("common.end_of_route"),
                );

                return (
                  <Pressable
                    key={ps.position}
                    accessibilityRole="button"
                    accessibilityLabel={`${stopName}${subtitle ? `, ${subtitle}` : ""}`}
                    onPress={() => handleSelect(ps.position, ps.stopId)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: colors.divider },
                      pressed && { backgroundColor: colors.fill },
                    ]}
                  >
                    <View style={styles.rowText}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{stopName}</Text>
                      {subtitle ? (
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: space.xs,
    paddingBottom: space.md,
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
    paddingTop: space.xs,
  },
  row: {
    minHeight: 52,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
