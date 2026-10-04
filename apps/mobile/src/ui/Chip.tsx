/**
 * Chip (4.4 §5.8, `radius.full`, `type.label`; canvas da 4.5, Terminal/Main). Duas formas:
 * - `accent`: tipo de dia ("Hoje · dia útil"); selecionado = fundo `accent` com texto `onAccent`;
 * - `ring`: "Todas" e o selo de linha; selecionado = contorno de 1,5 px na cor do texto.
 * Fundo `fill` quando não selecionado. Altura 36 como no canvas; o alvo de toque cresce com `hitSlop` até 44.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { type, useTheme } from "../theme";

export function Chip({
  label,
  selected,
  onPress,
  tone = "accent",
  accessibilityLabel,
  minWidth,
  children,
}: {
  /** Texto do chip; sem ele, o chip leva `children` (o selo de linha). */
  label?: string;
  selected: boolean;
  onPress: () => void;
  tone?: "accent" | "ring";
  accessibilityLabel?: string;
  /** Largura mínima (alvo de toque de 44 px em chips de um só símbolo, como "−" e "+"). */
  minWidth?: number;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const filled = tone === "accent" && selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        children ? styles.compact : null,
        minWidth !== undefined && { minWidth },
        { backgroundColor: filled ? colors.accent : colors.fill, borderColor: tone === "ring" && selected ? colors.text : "transparent" },
        pressed && { opacity: 0.6 },
      ]}
    >
      {label !== undefined ? (
        <Text style={[type.label, { color: filled ? colors.onAccent : colors.text }]}>{label}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Canvas: altura 36, padding lateral 14 (8 quando só há o selo), raio 18. O contorno de 1,5 px existe sempre
  // (transparente) para o chip não mudar de tamanho ao ser selecionado.
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  compact: { paddingHorizontal: 8 },
});
