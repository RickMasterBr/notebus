/**
 * PROVISÓRIA. Folha curta só com o título e o handle, para provar o empilhar e o fechar.
 * O bloco 3b a substitui pela TL-14 (Busca). O título reaproveita o texto da pílula que a abre.
 */
import { Text } from "react-native";
import { t } from "../i18n";
import { type, useTheme } from "../theme";
import { StackedSheet } from "./StackedSheet";

export function SearchSheet() {
  const { colors } = useTheme();
  return (
    <StackedSheet>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {t("home.search_placeholder")}
      </Text>
    </StackedSheet>
  );
}
