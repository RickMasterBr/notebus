import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph, InfoGlyph } from "./Glyphs";
import { pressedStyle } from "./pressed";

export interface NoticeCardProps {
  title: string;
  body?: string;
  tone?: "warning" | "danger";
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function NoticeCard({
  title,
  body,
  tone = "warning",
  onPress,
  accessibilityLabel,
}: NoticeCardProps) {
  const { colors } = useTheme();
  const toneColor = tone === "danger" ? colors.danger : colors.warning;

  const content = (
    <>
      <InfoGlyph color={toneColor} />
      <View style={styles.textCol}>
        <Text style={[type.bodyStrong, { color: colors.text }]}>{title}</Text>
        {body ? (
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {body}
          </Text>
        ) : null}
      </View>
      {onPress ? <ChevronRightGlyph color={colors.textSecondary} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.fill },
          pressedStyle(pressed),
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { backgroundColor: colors.fill }]}
    >
      {content}
    </View>
  );
}

export interface NoticeLineProps {
  text: string;
  tone?: "warning" | "danger";
}

export function NoticeLine({ text, tone = "warning" }: NoticeLineProps) {
  const { colors } = useTheme();
  const toneColor = tone === "danger" ? colors.danger : colors.warning;

  return (
    <View style={styles.line}>
      <InfoGlyph color={toneColor} />
      <Text style={[type.caption, { color: toneColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: minTouch,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  textCol: {
    flex: 1,
    gap: space.xs,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});
