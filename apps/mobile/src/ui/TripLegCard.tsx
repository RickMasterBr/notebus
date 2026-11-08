import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { t } from "../i18n";
import { elevation, minTouch, radius, space, type, useTheme } from "../theme";
import { ArrowRightGlyph } from "./Glyphs";
import { LineBadge } from "./LineBadge";
import { stackedAt } from "./componentRules";
import { pressedStyle } from "./pressed";

export interface TripLegCardAlight {
  time: string;
  approximate: boolean;
  stopName: string;
  tableTime: string | null;
  usualTime: string | null;
}

export interface TripLegCardProps {
  boardTime: string;
  boardStopName: string;
  alight: TripLegCardAlight | null;
  lineCode: string;
  lineColor: string;
  directionLabel: string;
  durationText: string;
  onChooseAlight: () => void;
  accessibilityLabel: string;
}

export function TripLegCard({
  boardTime,
  boardStopName,
  alight,
  lineCode,
  lineColor,
  directionLabel,
  durationText,
  onChooseAlight,
  accessibilityLabel,
}: TripLegCardProps) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const isStacked = stackedAt(fontScale);

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={
        !alight
          ? [{ name: "chooseAlight", label: t("trip.choose_alight") }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "chooseAlight") {
          onChooseAlight();
        }
      }}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.divider,
        },
      ]}
    >
      <View style={[styles.mainRow, isStacked && styles.stackedRow]}>
        <View style={styles.col}>
          <Text style={[type.timeLg, { color: colors.text }]}>{boardTime}</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {t("trip.boarded")}
          </Text>
          <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
            {boardStopName}
          </Text>
        </View>

        <View
          style={[
            styles.arrowContainer,
            isStacked && styles.arrowStacked,
          ]}
        >
          <ArrowRightGlyph color={colors.textSecondary} />
        </View>

        {alight ? (
          <View style={[styles.col, !isStacked && styles.colRight]}>
            <Text style={[type.timeLg, { color: colors.text }]}>
              {alight.approximate ? `~${alight.time}` : alight.time}
            </Text>
            <Text
              style={[type.body, { color: colors.text }, !isStacked && styles.textRight]}
              numberOfLines={2}
            >
              {alight.stopName}
            </Text>
            {alight.tableTime && alight.tableTime !== alight.time ? (
              <Text
                style={[
                  type.caption,
                  { color: colors.textSecondary },
                  !isStacked && styles.textRight,
                ]}
              >
                {t("trip.table", { time: alight.tableTime })}
              </Text>
            ) : null}
            {alight.usualTime && alight.usualTime !== alight.time ? (
              <Text
                style={[
                  type.caption,
                  { color: colors.textSecondary },
                  !isStacked && styles.textRight,
                ]}
              >
                {t("trip.usual", { time: alight.usualTime })}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={[styles.col, !isStacked && styles.colRight]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("trip.choose_alight")}
              onPress={onChooseAlight}
              style={({ pressed }) => [styles.chooseButton, pressedStyle(pressed)]}
            >
              <Text style={[type.bodyStrong, { color: colors.accent }]}>
                {t("trip.choose_alight")}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.bottomRow}>
        <LineBadge code={lineCode} color={lineColor} />
        {directionLabel ? (
          <Text
            style={[type.caption, { color: colors.textSecondary, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {directionLabel}
          </Text>
        ) : null}
        {durationText ? (
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {durationText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    ...elevation.card,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stackedRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.sm,
  },
  col: {
    flex: 1,
    gap: space.xs,
  },
  colRight: {
    alignItems: "flex-end",
  },
  textRight: {
    textAlign: "right",
  },
  arrowContainer: {
    paddingHorizontal: space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowStacked: {
    alignSelf: "center",
    transform: [{ rotate: "90deg" }],
    paddingHorizontal: 0,
    paddingVertical: space.xs,
  },
  chooseButton: {
    minHeight: minTouch,
    justifyContent: "center",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
});
