import { Pressable, StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { pressedStyle } from "../ui/pressed";
import { useSheets } from "./SheetsContext";

export function GotoReviewNotice({ routeId }: { routeId: string }) {
  const { colors } = useTheme();
  const { dispatch } = useSheets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sheet_goto.review_route.a11y")}
      onPress={() => dispatch({ type: "push", sheet: { kind: "route", routeId } })}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.fill },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[type.bodyStrong, { color: colors.text }]}>
        {t("sheet_goto.review_route")}
      </Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>
        {t("sheet_goto.review_route.body")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: minTouch,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
});
