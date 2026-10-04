/**
 * Ajustes mínimo (D-151): uma folha empilhada de uma altura com só a linha "Versão". Sete batidas seguidas nela abrem o
 * seletor do relógio de teste (D-095). Com o relógio já ligado, a 7ª batida abre o seletor para trocar o instante (a
 * faixa vermelha continua sendo o jeito de desligar). O resto da TL-12 fica para a E-08.
 * Versão: o `version` do `app.json`; build: o curto do commit (`EXPO_PUBLIC_BUILD_SHA`, definido pelo `app.config.ts`).
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import appJson from "../../app.json";
import { realNow } from "../data/clock";
import { createTapCounter } from "../data/testClockPicker";
import { t } from "../i18n";
import { type, useTheme } from "../theme";
import { ListRow } from "../ui/ListRow";
import { StackedSheet } from "./StackedSheet";
import { useSheets } from "./SheetsContext";
import { activeSheet } from "./stack";

const VERSION_TEXT = `${appJson.expo.version} (${process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D"})`;

export function SettingsSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const { state, dispatch } = useSheets();
  const isTop = activeSheet(state).id === id;
  const counter = useRef(createTapCounter()).current;
  const row = useRef<View>(null);
  const wasCovered = useRef(false);

  // Ao fechar o seletor, o foco do VoiceOver volta para a linha que o abriu.
  useEffect(() => {
    if (wasCovered.current && isTop && row.current) AccessibilityInfo.sendAccessibilityEvent(row.current, "focus");
    wasCovered.current = !isTop;
  }, [isTop]);

  return (
    <StackedSheet id={id}>
      <Text accessibilityRole="header" style={[type.title, styles.title, { color: colors.text }]}>
        {t("settings.title")}
      </Text>
      <ListRow
        ref={row}
        title={t("settings.version")}
        secondary={VERSION_TEXT}
        accessibilityLabel={`${t("settings.version")} ${VERSION_TEXT}`}
        // As batidas contam no relógio real, nunca no de teste.
        onPress={() => counter.tap(realNow()) && dispatch({ type: "push", sheet: { kind: "clockPicker" } })}
      />
    </StackedSheet>
  );
}

const styles = StyleSheet.create({
  title: { paddingBottom: 8 },
});
