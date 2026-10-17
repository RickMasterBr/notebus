import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { DayTypeCode } from "@notebus/domain";
import { createContext, useContext, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useNowTick } from "../data/useNowTick";
import { type WhyRowView, type WhyView, buildWhy } from "../data/whyView";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ConfidenceSeal } from "../ui/ConfidenceSeal";
import { CrossGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { pressedStyle } from "../ui/pressed";

const HeightContext = createContext<(height: number) => void>(() => {});

function WhyHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

export function WhySheet({
  id,
  tripId,
  position,
  serviceDate,
  dayType,
}: {
  id: number;
  tripId: string;
  position: number;
  serviceDate: string;
  dayType: DayTypeCode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const registro = useRegistro();
  const instant = useNowTick();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);

  const loading = schedule.status === "loading" || registro.status === "loading";
  const skeleton = useSkeletonVisible(loading);

  const why = useMemo<WhyView | null>(() => {
    if (schedule.status !== "ready" || registro.status !== "ready") return null;
    return buildWhy({
      tripId,
      position,
      data: schedule.data,
      records: registro.records,
      now: instant,
      serviceDay: { date: serviceDate, dayType },
    });
  }, [schedule, registro, instant, tripId, position, serviceDate, dayType]);

  const detents = useMemo<StackedDetents>(
    () => ({
      snapPoints: [why?.last ? "64%" : "54%"],
      initialIndex: 0,
      Handle: WhyHandle,
    }),
    [why?.last],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(detents.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={detents}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space.md }]}
            showsVerticalScrollIndicator={false}
          >
            {loading || skeleton ? (
              skeleton ? <Skeleton rows={5} /> : null
            ) : why ? (
              <>
                {/* Cabeçalho no quadro da VerifySheet: título com selo da linha + único ✕ */}
                <View style={styles.header}>
                  <View style={styles.titleRow}>
                    <LineBadge code={why.line.code} color={why.line.color} />
                    <Text accessibilityRole="header" style={[type.title, styles.title, { color: colors.text }]}>
                      {why.title}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("common.close")}
                    onPress={close}
                    style={({ pressed }) => [styles.closeHitTarget, pressedStyle(pressed)]}
                  >
                    <View style={[styles.closeIconCircle, { backgroundColor: colors.fill }]}>
                      <CrossGlyph color={colors.textSecondary} />
                    </View>
                  </Pressable>
                </View>

                {/* Contexto da viagem */}
                <Text style={[type.caption, styles.context, { color: colors.textSecondary }]}>
                  {why.context}
                </Text>

                {/* Lista agrupada com 3 ou 4 linhas */}
                <View style={[styles.groupedList, { backgroundColor: colors.fill }]}>
                  {/* Linha 1: Na tabela */}
                  <WhySimpleRow row={why.table} isLast={false} />

                  {/* Linha 2: Costuma passar */}
                  <WhyTypicalRow view={why.typical} isLast={false} />

                  {/* Linha 3: Anotações */}
                  <WhyCountRow count={why.count} isLast={why.last === null} />

                  {/* Linha 4: Última (se houver) */}
                  {why.last ? <WhySimpleRow row={why.last} isLast={true} /> : null}
                </View>

                {/* Rodapé explicativo */}
                <Text style={[type.caption, styles.footnote, { color: colors.textSecondary }]}>
                  {why.footnote}
                </Text>
              </>
            ) : null}
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function WhySimpleRow({ row, isLast }: { row: WhyRowView; isLast: boolean }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.25;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={row.a11y}
      style={[
        styles.rowContainer,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={stacked ? styles.stackedRow : styles.horizontalRow}
      >
        <Text style={[type.bodyStrong, { color: colors.text }]}>{row.label}</Text>
        <Text style={[type.timeMd, styles.num, { color: colors.text }]}>{row.value}</Text>
      </View>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[type.caption, styles.detail, { color: colors.textSecondary }]}
      >
        {row.detail}
      </Text>
    </View>
  );
}

function WhyTypicalRow({ view, isLast }: { view: WhyView["typical"]; isLast: boolean }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.25;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={view.a11y}
      style={[
        styles.rowContainer,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={stacked ? styles.stackedRow : styles.horizontalRow}
      >
        <Text style={[type.bodyStrong, { color: colors.text }]}>{view.label}</Text>
        <Text style={[type.timeMd, styles.num, { color: colors.text }]}>{view.value}</Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.typicalDetailRow}
      >
        {view.range ? (
          <>
            <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
              {view.range} ·
            </Text>
            {view.confidence ? <ConfidenceSeal confidence={view.confidence} /> : null}
          </>
        ) : (
          <Text style={[type.caption, styles.detail, { color: colors.textSecondary }]}>
            {view.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

function WhyCountRow({ count, isLast }: { count: WhyView["count"]; isLast: boolean }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.25;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={count.a11y}
      style={[
        styles.rowContainer,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={stacked ? styles.stackedRow : styles.horizontalRow}
      >
        <Text style={[type.bodyStrong, { color: colors.text }]}>{count.label}</Text>
        <Text style={[type.timeMd, styles.num, { color: colors.text }]}>{count.value}</Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.countDetailCol}
      >
        <Text style={[type.caption, styles.detail, { color: colors.textSecondary }]}>
          {count.levelText}
        </Text>
        <Text style={[type.caption, styles.detail, { color: colors.textSecondary }]}>
          {count.nextText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 22,
    flexShrink: 1,
  },
  closeHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIconCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  context: {
    marginTop: -space.xs,
  },
  groupedList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  rowContainer: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  horizontalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stackedRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
  },
  num: {
    fontVariant: ["tabular-nums"],
  },
  detail: {
    lineHeight: 18,
  },
  typicalDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countDetailCol: {
    gap: 2,
  },
  footnote: {
    lineHeight: 18,
  },
});
