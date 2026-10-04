/** Componente visual para exibir o selo de identificação (número e cor) de uma linha. */
/** Selo de linha (4.4 §5.3): número sempre junto da cor, nunca com opacidade reduzida (D-051). */
import { StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { lineColors, lineOutline, radius, space, type, useTheme } from "../theme";

/**
 * Define se o texto sobre a cor de fundo deve ser escuro ou branco, baseado
 * no cálculo de luminância da cor HEX. Garante acessibilidade de contraste visual.
 *
 * @param hex Cor em formato hexadecimal (ex: "#FF0000")
 * @returns `true` se o texto deve ser escuro, `false` para branco.
 */
function darkTextOn(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

/**
 * Componente visual que exibe o selo identificador da linha de ônibus (ex: "1", "12").
 * O texto e o contorno se adaptam automaticamente para melhor leitura sobre
 * a cor original da linha, seguindo o padrão de contraste.
 */
export function LineBadge({ code, color }: { code: string; color: string }) {
  const { name } = useTheme();
  const known = lineColors[code];
  const dark = known ? known.darkText : darkTextOn(color);
  const outline = name === "dark" && (known ? known.outline : false);
  return (
    <View
      // D-046: "Linha 1", não só "1". Dentro de um grupo que já se lê inteiro (cartão, linha do Ponto) este rótulo não é lido à parte.
      accessible
      accessibilityLabel={t("common.line.a11y", { line: code })}
      style={[
        styles.badge,
        { backgroundColor: color },
        outline && { borderWidth: lineOutline.width, borderColor: lineOutline.color },
      ]}
    >
      <Text style={[type.label, { color: dark ? "#1C1C1E" : "#FFFFFF" }]}>{code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 36,
    alignItems: "center",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
});
