/**
 * Aviso de migração que falhou. PROVISÓRIO: a 4.4/4.5 não especificam este aviso (E-01 bloco 5).
 * Só texto, nos tokens `danger` sobre `surface`; sem ícone nem ornamento.
 */
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";

export function MigrationNotice() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ backgroundColor: colors.surface }}>
      <Text accessibilityRole="alert" style={[type.body, styles.text, { color: colors.danger }]}>
        {t("migration.failed")}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  text: { padding: space.md },
});
