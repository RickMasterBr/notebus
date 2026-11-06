import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { t } from "../i18n";
import { minTouch, opacity, space, type, useTheme } from "../theme";
import { ChevronDownGlyph, ChevronLeftGlyph } from "./Glyphs";
import { topBarShowsBackText } from "./componentRules";
import { pressedStyle } from "./pressed";

export interface ScreenTopBarAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export interface ScreenTopBarProps {
  title: string;
  onBack?: () => void;
  variant?: "push" | "modal";
  action?: ScreenTopBarAction;
}

export function ScreenTopBar({
  title,
  onBack,
  variant = "push",
  action,
}: ScreenTopBarProps) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();

  const isModal = variant === "modal";
  const backLabel = isModal ? t("common.close") : t("common.back");
  const showBackText = !isModal && topBarShowsBackText(fontScale);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressedStyle(pressed)]}
        >
          {isModal ? (
            <ChevronDownGlyph color={colors.accent} />
          ) : (
            <ChevronLeftGlyph color={colors.accent} />
          )}
          {showBackText ? (
            <Text style={[type.body, { color: colors.accent }]}>
              {t("common.back")}
            </Text>
          ) : null}
        </Pressable>

        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: Boolean(action.disabled) }}
            disabled={action.disabled}
            onPress={action.disabled ? undefined : action.onPress}
            style={({ pressed }) => [
              styles.actionButton,
              pressedStyle(pressed, action.disabled),
            ]}
          >
            <Text
              style={[
                type.body,
                { color: colors.accent },
                action.disabled ? { opacity: opacity.muted } : null,
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.actionPlaceholder} />
        )}
      </View>

      <Text
        accessibilityRole="header"
        style={[type.largeTitle, { color: colors.text }]}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  topRow: {
    height: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    height: minTouch,
    minWidth: minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  actionButton: {
    height: minTouch,
    minWidth: minTouch,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  actionPlaceholder: {
    width: minTouch,
    height: minTouch,
  },
});
