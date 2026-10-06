/**
 * Início vazio (4.5 §8.5, D-066, "Começar do zero", E-05 Bloco 3 item 3.2).
 * Mostra o atalho tracejado "Casa" que abre a folha Lugar com o nome "Casa" pré-preenchido,
 * e o cartão "Comece pelo ponto onde você pega o ônibus".
 */
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useSheets } from "../sheets/SheetsContext";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { PlaceIconGlyph, PlusGlyph } from "../ui/Glyphs";

export function EmptyHome() {
  const { colors } = useTheme();
  const { dispatch } = useSheets();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>
        {/* Faixa de atalhos vazios: Casa tracejado (convite ao primeiro lugar) */}
        <View style={styles.shortcutsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("empty_home.dashed_casa")}
            onPress={() => dispatch({ type: "push", sheet: { kind: "place", initialName: "Casa" } })}
            style={({ pressed }) => [styles.shortcutItem, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.shortcutCircle, { borderColor: colors.accent }]}>
              <PlaceIconGlyph icon="casa" color={colors.accent} size={24} />
            </View>
            <Text style={[type.caption, { color: colors.text, fontWeight: "500", textAlign: "center" }]}>
              {t("empty_home.dashed_casa")}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("home.shortcut.add")}
            onPress={() => dispatch({ type: "push", sheet: { kind: "place" } })}
            style={({ pressed }) => [styles.shortcutItem, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.shortcutCircle, { borderColor: colors.textSecondary }]}>
              <PlusGlyph color={colors.textSecondary} />
            </View>
            <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "500", textAlign: "center" }]}>
              {t("home.shortcut.add")}
            </Text>
          </Pressable>
        </View>

        {/* Cartão Comece pelo ponto onde você pega o ônibus */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[type.title, { color: colors.text }]}>{t("home.empty.title")}</Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>{t("home.empty.body")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("home.empty.action")}
            onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("home.empty.action")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.md, justifyContent: "center" },
  content: { gap: space.lg },
  shortcutsRow: { flexDirection: "row", gap: space.md },
  shortcutItem: { width: 68, alignItems: "center", gap: 6 },
  shortcutCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  card: { borderRadius: radius.md, padding: space.md, gap: space.md },
  button: { minHeight: minTouch, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
});
