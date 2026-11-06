import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { TargetGlyph } from "./Glyphs";
import type { RouteStopVariant } from "./componentRules";
import { pressedStyle } from "./pressed";

export interface RouteStopRowProps {
  name: string;
  time?: string | null;
  approximate?: boolean;
  passLabel?: string | null;
  externalId?: string | null;
  lineColor: string;
  highlighted?: boolean;
  variant: RouteStopVariant;
  isFirst?: boolean;
  isLast?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}

export function RouteStopRow({
  name,
  time,
  approximate,
  passLabel,
  externalId,
  lineColor,
  highlighted = false,
  variant,
  isFirst = false,
  isLast = false,
  accessibilityLabel,
  onPress,
}: RouteStopRowProps) {
  const { colors } = useTheme();

  const formattedTime = time ? (approximate ? `~${time}` : time) : null;
  const subtitle = [passLabel, formattedTime, externalId]
    .filter(Boolean)
    .join(" · ");

  const timeline = (
    <View
      style={styles.timelineCol}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!isFirst && (
        <View
          style={[styles.timelineTrackTop, { backgroundColor: lineColor }]}
        />
      )}
      {!isLast && (
        <View
          style={[styles.timelineTrackBottom, { backgroundColor: lineColor }]}
        />
      )}
      <View
        style={[
          styles.circle,
          highlighted
            ? { backgroundColor: lineColor }
            : { borderWidth: 2, borderColor: lineColor },
        ]}
      />
    </View>
  );

  const middleContent = (
    <View style={styles.middleCol}>
      <View style={styles.nameRow}>
        {highlighted ? (
          <TargetGlyph color={colors.accent} size={16} />
        ) : null}
        <Text
          style={[
            type.body,
            {
              color:
                variant === "passed"
                  ? colors.textSecondary
                  : colors.text,
            },
          ]}
        >
          {name}
        </Text>
      </View>
      {subtitle ? (
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const highlightStyle = highlighted
    ? {
        backgroundColor: colors.highlight,
        borderColor: colors.accent,
        borderWidth: 1.5,
      }
    : styles.rowBorderDefault;

  if (variant === "read") {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[styles.row, highlightStyle]}
      >
        {timeline}
        {middleContent}
      </View>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        highlightStyle,
        pressedStyle(pressed),
      ]}
    >
      {timeline}
      {middleContent}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTouch,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  rowBorderDefault: {
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  timelineCol: {
    width: 20,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  timelineTrackTop: {
    position: "absolute",
    top: 0,
    bottom: "50%",
    width: 2,
  },
  timelineTrackBottom: {
    position: "absolute",
    top: "50%",
    bottom: 0,
    width: 2,
  },
  circle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  middleCol: {
    flex: 1,
    gap: space.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});
