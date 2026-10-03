/** Componente base para renderizar linhas clicáveis padronizadas em listas. */
/** Linha de lista (4.4 §5.12), variantes simples e com selo: título + valor secundário, separador, alvo ≥ 44 px. */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouch, space, type, useTheme } from "../theme";

/**
 * Componente que renderiza uma linha padronizada de lista.
 * Possui área de toque mínima de 44px (Acessibilidade).
 * Aceita um elemento opcional à esquerda (`leading`), um título principal,
 * e um texto secundário à direita.
 */
export function ListRow({
  title,
  detail,
  secondary,
  leading,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  /** Valor secundário sob o título (ex.: o ID de um ponto), em `type.caption`. */
  detail?: string;
  secondary?: string;
  leading?: ReactNode;
  onPress?: () => void;
  /** Leitura única da linha pelo VoiceOver, quando o título + valor secundário não bastam. */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.divider },
        pressed && onPress ? { opacity: 0.6 } : null,
      ]}
    >
      {leading}
      <View style={styles.title}>
        <Text style={[type.body, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[type.caption, { color: colors.textSecondary }]}>{detail}</Text> : null}
      </View>
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
