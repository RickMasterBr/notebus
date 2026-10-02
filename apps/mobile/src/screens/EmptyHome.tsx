/** Início vazio (4.5 §8.5, "Começar do zero"). O botão ainda não faz nada: o cadastro (TL-11) é da E-02. */
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";

export function EmptyHome() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[type.title, { color: colors.text }]}>{t("home.empty.title")}</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>{t("home.empty.body")}</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("home.empty.action")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.md, justifyContent: "center" },
  card: { borderRadius: radius.md, padding: space.md, gap: space.md },
  button: { minHeight: minTouch, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
});
