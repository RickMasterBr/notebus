/** Componente base para renderizar linhas clicáveis padronizadas em listas. */
/** Linha de lista (4.4 §5.12), variantes simples e com selo: título + valor secundário, separador, alvo ≥ 44 px. */
import type { ReactNode, Ref } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { subline } from "../data/rowSubline";
import { minTouch, space, type, useTheme } from "../theme";
import { pressedStyle } from "./pressed";

/**
 * Componente que renderiza uma linha padronizada de lista.
 * Possui área de toque mínima de 44px (Acessibilidade).
 * Aceita um elemento opcional à esquerda (`leading`), um título principal,
 * e um texto secundário à direita.
 */
export function ListRow({
  title,
  detail,
  extra,
  secondary,
  leading,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  ref,
}: {
  title: string;
  /** Valor secundário sob o título (ex.: o ID de um ponto), em `type.caption`. */
  detail?: string;
  /** Mais uma linha pequena sob o título (ex.: o apelido que casou na busca). */
  extra?: string;
  secondary?: string;
  leading?: ReactNode;
  onPress?: () => void;
  /** Leitura única da linha pelo VoiceOver, quando o título + valor secundário não bastam. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Aponta para a linha: o foco do VoiceOver volta para ela quando uma folha por cima fecha. */
  ref?: Ref<View>;
}) {
  const { colors } = useTheme();
  const line = subline(detail, extra);
  return (
    <Pressable
      ref={ref}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.divider },
        pressedStyle(pressed, !onPress),
      ]}
    >
      {leading}
      <View style={styles.title}>
        <Text style={[type.body, { color: colors.text }]}>{title}</Text>
        {line ? <Text style={[type.caption, { color: colors.textSecondary }]}>{line}</Text> : null}
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
