import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";

export interface HomeGuideCardProps {
  kind: "line" | "register" | "mobilis";
  dismissible: boolean;
  onAction: () => void;
  onDismiss: () => void;
}

export function HomeGuideCard({ kind, dismissible, onAction, onDismiss }: HomeGuideCardProps) {
  const { colors } = useTheme();

  let titleKey: "home.guide.line.title" | "home.guide.register.title" | "home.guide.mobilis.title";
  let bodyKey: "home.guide.line.body" | "home.guide.register.body" | "home.guide.mobilis.body";
  let actionKey: "home.guide.line.action" | "home.guide.register.action" | "home.guide.mobilis.action";

  if (kind === "line") {
    titleKey = "home.guide.line.title";
    bodyKey = "home.guide.line.body";
    actionKey = "home.guide.line.action";
  } else if (kind === "register") {
    titleKey = "home.guide.register.title";
    bodyKey = "home.guide.register.body";
    actionKey = "home.guide.register.action";
  } else {
    titleKey = "home.guide.mobilis.title";
    bodyKey = "home.guide.mobilis.body";
    actionKey = "home.guide.mobilis.action";
  }

  const title = t(titleKey);
  const body = t(bodyKey);
  const actionLabel = t(actionKey);

  return (
    <View style={[styles.card, { backgroundColor: colors.fill }]}>
      <View style={styles.headerRow}>
        <Text
          accessibilityRole="header"
          style={[type.bodyStrong, { color: colors.text, flex: 1 }]}
        >
          {title}
        </Text>
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={onDismiss}
            style={styles.closeButton}
            hitSlop={space.xs}
          >
            <CrossGlyph color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.body, { color: colors.textSecondary }]}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={onAction}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: colors.accent },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={[type.bodyStrong, { color: colors.onAccent, textAlign: "center" }]}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  closeButton: {
    width: minTouch,
    height: minTouch,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -space.xs,
    marginRight: -space.xs,
  },
  actionButton: {
    minHeight: minTouch,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
