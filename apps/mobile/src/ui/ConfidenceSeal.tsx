/**
 * Selo de confiança (4.5 §2.2, D-040): barras + a palavra, sempre juntas. Nível = quantas barras cheias
 * (alta 3, média 2, baixa 1, estimado 0 = barras vazias). As barras ficam fora da leitura; quem lê ouve só a palavra.
 */
import { StyleSheet, Text, View } from "react-native";
import { confidenceText } from "../data/stopCardText";
import type { NextBus } from "../data/stopCard";
import { space, type, useTheme } from "../theme";

const LEVEL: Record<NextBus["confidence"], number> = { estimated: 0, low: 1, medium: 2, high: 3 };
const BAR_HEIGHTS = [4, 7, 11] as const;

export function ConfidenceSeal({ confidence }: { confidence: NextBus["confidence"] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {BAR_HEIGHTS.map((height, i) => (
          <View
            key={height}
            style={[styles.bar, { height, backgroundColor: i < LEVEL[confidence] ? colors.textSecondary : colors.divider }]}
          />
        ))}
      </View>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{confidenceText(confidence)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  // Canvas: 13×11, três barras de 3 px (4, 7 e 11 px de altura) com 2 px entre elas.
  bars: { width: 13, height: 11, flexDirection: "row", alignItems: "flex-end", gap: space.xs / 2 },
  bar: { width: 3, borderRadius: 1 },
});
