import { Pressable, StyleSheet, Text, View } from "react-native";
import type { WeekSummary } from "../data/recordsScreen";
import { dateNumbers } from "../data/testClockPicker";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronDownGlyph } from "./Glyphs";
import { NoticeLine } from "./NoticeCard";
import { pressedStyle } from "./pressed";

export interface WeekSummaryRowProps {
  week?: WeekSummary;
  weekStart?: string;
  tripCount?: number;
  pendingCount?: number;
  expanded: boolean;
  onPress: () => void;
}

export function WeekSummaryRow(props: WeekSummaryRowProps) {
  const { colors } = useTheme();
  const weekStart = props.week ? props.week.weekStart : (props.weekStart ?? "");
  const tripCount = props.week ? props.week.tripCount : (props.tripCount ?? 0);
  const pendingCount = props.week ? props.week.pendingCount : (props.pendingCount ?? 0);
  const { expanded, onPress } = props;

  const date = weekStart ? dateNumbers(weekStart) : "";
  const label = t("records.week.summary", { date, n: tripCount });
  const a11yLabel = t("records.week.summary.a11y", { date, n: tripCount });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.divider,
        },
        pressedStyle(pressed),
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <ChevronDownGlyph color={colors.textSecondary} />
        </View>
      </View>
      {pendingCount > 0 && (
        <View style={styles.noticeContainer}>
          <NoticeLine text={t("records.week.pending", { n: pendingCount })} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    justifyContent: "center",
    gap: space.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticeContainer: {
    paddingTop: space.xs,
  },
});
