/**
 * Seletor de data e hora do relógio de teste (D-151), sem biblioteca: três controles "−/+" (dia ±1 dia, hora ±1 h,
 * minuto ±5 min), o valor escolhido (data completa e HH:MM) e o botão "Ligar". Começa no instante ligado ou, desligado,
 * em "agora" (relógio real). Ligar chama o relógio de teste e fecha só esta folha (a faixa vermelha aparece por cima de tudo).
 * Os "−/+" têm rótulo próprio para o VoiceOver ("Dia, mais"). A lógica de somar está em `data/testClockPicker.ts`.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lisbonWallClock } from "@notebus/domain";
import { realNow } from "../data/clock";
import { useTestClock } from "../data/TestClockProvider";
import { type PickerUnit, dateNumbers, hhmm, stepWall, weekdayName } from "../data/testClockPicker";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { StackedSheet } from "./StackedSheet";
import { useSheets } from "./SheetsContext";

const UNITS: { unit: PickerUnit; label: "test_clock.day" | "test_clock.hour" | "test_clock.minute" }[] = [
  { unit: "day", label: "test_clock.day" },
  { unit: "hour", label: "test_clock.hour" },
  { unit: "minute", label: "test_clock.minute" },
];

export function ClockPickerSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { dispatch } = useSheets();
  const clock = useTestClock();
  const [wall, setWall] = useState(() => lisbonWallClock(clock.chosen ?? realNow()));

  const valueOf = (unit: PickerUnit) =>
    unit === "day"
      ? t("test_clock.date", { weekday: weekdayName(wall.date), date: dateNumbers(wall.date) })
      : unit === "hour"
        ? hhmm(wall.minute).slice(0, 2)
        : hhmm(wall.minute).slice(3);

  return (
    <StackedSheet id={id}>
      <View style={[styles.summary, { backgroundColor: colors.highlight }]} accessible accessibilityLabel={`${weekdayName(wall.date)} ${dateNumbers(wall.date)} ${hhmm(wall.minute)}`}>
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          {t("test_clock.date", { weekday: weekdayName(wall.date), date: dateNumbers(wall.date) })}
        </Text>
        <Text style={[type.timeLg, { color: colors.text }]}>{hhmm(wall.minute)}</Text>
      </View>

      {UNITS.map(({ unit, label }) => (
        <View key={unit} style={[styles.row, { borderBottomColor: colors.divider }]}>
          <Chip
            label="−"
            selected={false}
            minWidth={minTouch}
            accessibilityLabel={t("test_clock.step.less", { unit: t(label) })}
            onPress={() => setWall((w) => stepWall(w, unit, -1))}
          />
          <View style={styles.value}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t(label)}</Text>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{valueOf(unit)}</Text>
          </View>
          <Chip
            label="+"
            selected={false}
            minWidth={minTouch}
            accessibilityLabel={t("test_clock.step.more", { unit: t(label) })}
            onPress={() => setWall((w) => stepWall(w, unit, 1))}
          />
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clock.turnOn(wall);
          dispatch({ type: "close", id });
        }}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, marginBottom: insets.bottom + space.md }, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("test_clock.turn_on")}</Text>
      </Pressable>
    </StackedSheet>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, marginTop: space.sm, marginBottom: space.sm, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: minTouch + space.sm, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  value: { flex: 1, alignItems: "center" },
  button: { minHeight: minTouch, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, marginTop: space.md },
});
