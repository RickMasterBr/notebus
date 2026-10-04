/**
 * Entrada de Ajustes no Início (D-151): engrenagem discreta no canto de cima, atrás das folhas (sem mexer nelas).
 * 4.4 não tem glifo de engrenagem: símbolo de texto simples (`GearGlyph`). Rótulo "Ajustes" para o VoiceOver.
 * Ao fechar Ajustes, o foco volta para ela (a folha inicial também pede o foco para a pílula; este pedido vem depois).
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, type View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTestClock } from "../data/TestClockProvider";
import { useSheets } from "../sheets/SheetsContext";
import { t } from "../i18n";
import { minTouch, space, useTheme } from "../theme";
import { GearGlyph } from "../ui/Glyphs";

/** A faixa vermelha cobre os 28 pt de cima (mais a área segura): a engrenagem desce para não ficar embaixo dela. */
const BANNER_BAND = 28;

export function SettingsButton() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const { chosen } = useTestClock();
  const covered = state.stack.length > 1;
  const button = useRef<View>(null);
  const openedHere = useRef(false);
  const wasCovered = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wasCovered.current && !covered && openedHere.current) {
      openedHere.current = false;
      // Depois do pedido de foco da pílula (efeito da folha inicial, que roda depois deste): o último vale.
      timer = setTimeout(() => button.current && AccessibilityInfo.sendAccessibilityEvent(button.current, "focus"), 0);
    }
    wasCovered.current = covered;
    return () => clearTimeout(timer);
  }, [covered]);

  return (
    <Pressable
      ref={button}
      accessibilityRole="button"
      accessibilityLabel={t("settings.title")}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      onPress={() => {
        openedHere.current = true;
        dispatch({ type: "push", sheet: { kind: "settings" } });
      }}
      style={({ pressed }) => [styles.button, { top: insets.top + space.sm + (chosen === null ? 0 : BANNER_BAND) }, pressed && { opacity: 0.6 }]}
    >
      <GearGlyph color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { position: "absolute", right: space.sm, width: minTouch, height: minTouch, alignItems: "center", justifyContent: "center" },
});
