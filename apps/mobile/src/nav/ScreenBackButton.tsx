/** Botão de retorno do topo de toda tela (D-397): chevron girado e rótulo vindo do catálogo. */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { minTouch, space, type, useTheme } from "../theme";
import { ChevronRightGlyph } from "../ui/Glyphs";
import { pressedStyle } from "../ui/pressed";

export function ScreenBackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      hitSlop={space.xs}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressedStyle(pressed)]}
    >
      <View style={styles.chevron}>
        <ChevronRightGlyph color={colors.accent} />
      </View>
      <Text style={[type.body, { color: colors.accent }]}>{t("common.back")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    top: 0,
    left: space.sm,
    height: minTouch,
    minWidth: minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // A seta do catálogo aponta para a direita: girada 180° vira o "‹" do topo.
  chevron: { transform: [{ rotate: "180deg" }] },
});
