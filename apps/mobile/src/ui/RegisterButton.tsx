/**
 * Botão flutuante "Registrar" (4.4 §5.2; canvas da 4.5, `Componentes.dc.html` "Botão Registrar nos 3 estados"):
 * pílula de 56 px, `accent`, "+" e a palavra, `elevation.card`. Estados: padrão; pressionado (96%); desabilitado
 * ("sem rede cadastrada": fundo `fill`, texto `textSecondary`, sem sombra), usado enquanto os horários não carregaram.
 * Quem o posiciona (acima do topo da folha, no canto de baixo à direita) é a folha inicial.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { PlusGlyph } from "./Glyphs";

export const REGISTER_BUTTON_HEIGHT = 56;

export function RegisterButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const fg = disabled ? colors.textSecondary : colors.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("home.register_button.a11y")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled ? { backgroundColor: colors.fill } : [{ backgroundColor: colors.accent }, elevation.card],
        // Pressionado: encolhe para 96% (4.5 §2.5, 100 ms), antes de qualquer resultado.
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <PlusGlyph color={fg} />
      <Text style={[styles.label, { color: fg }]}>{t("home.register_button")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Canvas: altura 56, raio 28, padding 0 22 0 18, 8 px entre o ícone e a palavra, 17/600.
  button: {
    height: REGISTER_BUTTON_HEIGHT,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: 18,
    paddingRight: 22,
  },
  label: { fontSize: 17, fontWeight: "600" },
});
