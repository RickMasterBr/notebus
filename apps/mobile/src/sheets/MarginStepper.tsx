/**
 * Componente isolado de ajuste da margem (E-08 boost da margem, item 3a).
 * Tem seu próprio estado local para feedback imediato e React.memo para não re-renderizar
 * quando o resto da SettingsSheet mudar. Gravação com trailing debounce de 500 ms (item 3b)
 * e flush no fechamento da folha.
 */
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { adjustableStep, createMarginStepper } from "../data/marginStepper";
import { usePreferences } from "../data/PreferencesProvider";
import { marginLimits } from "../data/settingsView";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";

const DEBOUNCE_MS = 500;

export const MarginStepper = memo(function MarginStepper() {
  const { colors } = useTheme();
  const prefs = usePreferences();

  // Margem local para feedback imediato e reversão em caso de recusa
  const [margin, setMargin] = useState(prefs.margin);
  const setMarginRef = useRef(setMargin);
  setMarginRef.current = setMargin;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const stepperRef = useRef<ReturnType<typeof createMarginStepper> | null>(null);
  if (!stepperRef.current) {
    stepperRef.current = createMarginStepper({
      initial: prefs.margin,
      show: (val) => setMarginRef.current(val),
      write: (val) => prefsRef.current.setMargin(val),
      debounce: {
        ms: DEBOUNCE_MS,
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    });
  }
  const stepper = stepperRef.current;

  useEffect(() => {
    stepper.sync(prefs.margin);
  }, [prefs.margin, stepper]);

  useEffect(() => {
    return () => {
      stepper.flush();
    };
  }, [stepper]);

  const handleStepMargin = (dir: 1 | -1) => {
    stepper.step(dir);
  };

  const limits = marginLimits(margin);

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t("settings.margin.a11y", { n: margin })}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const direction = adjustableStep(e.nativeEvent.actionName);
        if (direction !== null) stepper.step(direction);
      }}
      style={[styles.stepperRow, { borderBottomColor: colors.divider, backgroundColor: colors.bg }]}
    >
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>
        {t("settings.margin.title")}
      </Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.margin.less")}
          disabled={limits.atMin}
          onPress={() => handleStepMargin(-1)}
          style={({ pressed }) => [
            styles.stepperButton,
            { backgroundColor: colors.fill },
            limits.atMin && { opacity: 0.3 },
            pressed && !limits.atMin && { opacity: 0.7 },
          ]}
        >
          <Text style={[type.title, { color: colors.text }]}>−</Text>
        </Pressable>
        <Text style={[type.bodyStrong, styles.stepperValue, { color: colors.text }]}>
          {t("settings.margin.value", { n: margin })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.margin.more")}
          disabled={limits.atMax}
          onPress={() => handleStepMargin(1)}
          style={({ pressed }) => [
            styles.stepperButton,
            { backgroundColor: colors.fill },
            limits.atMax && { opacity: 0.3 },
            pressed && !limits.atMax && { opacity: 0.7 },
          ]}
        >
          <Text style={[type.title, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  stepperRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    gap: space.sm,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  stepperButton: {
    minWidth: minTouch,
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 50,
    textAlign: "center",
  },
});
