/**
 * Faixa vermelha do relógio de teste (D-151, E-02 §4.5): `View` absoluta no topo, por cima de tudo (folhas incluídas), só
 * com o relógio ligado. Fora do layout: não entra na altura de nenhuma folha (D-150). Toda tocável: tocar desliga.
 * `color.danger` com `color.on-accent`, `type.label`, altura = área segura + 28 pt.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTestClock } from "../data/TestClockProvider";
import { bannerA11yText, bannerText } from "../data/testClockPicker";
import { type, useTheme } from "../theme";

const BAND_HEIGHT = 28;

export function TestClockBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { chosen, turnOff } = useTestClock();
  if (chosen === null) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bannerA11yText(chosen)}
      onPress={turnOff}
      style={({ pressed }) => [
        styles.band,
        { backgroundColor: colors.danger, minHeight: insets.top + BAND_HEIGHT, paddingTop: insets.top },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[type.label, styles.text, { color: colors.onAccent }]}>{bannerText(chosen)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `zIndex` e `elevation` altos: por cima das folhas e do fundo escurecido, que são irmãos absolutos desta vista.
  band: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10_000, elevation: 10_000, justifyContent: "center" },
  text: { textAlign: "center", paddingHorizontal: 12, paddingVertical: 6 },
});
