/** Linha de lista (4.4 §5.12), variantes simples e com selo: título + valor secundário, separador, alvo ≥ 44 px. */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { minTouch, space, type, useTheme } from "../theme";

export function ListRow({
  title,
  secondary,
  leading,
  onPress,
}: {
  title: string;
  secondary?: string;
  leading?: ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.divider },
        pressed && onPress ? { opacity: 0.6 } : null,
      ]}
    >
      {leading}
      <Text style={[type.body, styles.title, { color: colors.text }]}>{title}</Text>
      {secondary ? <Text style={[type.caption, { color: colors.textSecondary }]}>{secondary}</Text> : null}
    </Pressable>
  );
}


const styles = StyleSheet.create({
  row: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1 },
});
