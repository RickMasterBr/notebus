/** Selo de linha (4.4 §5.3): número sempre junto da cor, nunca com opacidade reduzida (D-051). */
import { StyleSheet, Text, View } from "react-native";
import { lineColors, lineOutline, radius, space, type, useTheme } from "../theme";

/** Texto escuro ou branco sobre a cor, para uma linha fora da tabela da 4.4 §1.3 (contraste pela luminância). */
function darkTextOn(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

export function LineBadge({ code, color }: { code: string; color: string }) {
  const { name } = useTheme();
  const known = lineColors[code];
  const dark = known ? known.darkText : darkTextOn(color);
  const outline = name === "dark" && (known ? known.outline : false);
  return (
    <View
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
