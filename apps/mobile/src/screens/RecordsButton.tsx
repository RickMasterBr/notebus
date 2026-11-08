/**
 * Entrada de Registros no Início (D-388, D-410, D-411).
 * Botão no mapa à esquerda de Ajustes, com marcador quando pendingTotal > 0.
 */
import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useTestClock } from "../data/TestClockProvider";
import { useNowTick } from "../data/useNowTick";
import { buildRecordsScreen } from "../data/recordsScreen";
import { useSheets } from "../sheets/SheetsContext";
import { t } from "../i18n";
import { minTouch, space, useTheme } from "../theme";
import { RecordsGlyph } from "../ui/Glyphs";
import { MapButton } from "../ui/MapButton";

const BANNER_BAND = 28;

export function RecordsButton() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const { chosen } = useTestClock();
  const registro = useRegistro();
  const schedule = useSchedule();
  const instant = useNowTick();

  const covered = state.stack.length > 1;
  const button = useRef<View>(null);
  const openedHere = useRef(false);
  const wasCovered = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wasCovered.current && !covered && openedHere.current) {
      openedHere.current = false;
      timer = setTimeout(
        () => button.current && AccessibilityInfo.sendAccessibilityEvent(button.current, "focus"),
        0,
      );
    }
    wasCovered.current = covered;
    return () => clearTimeout(timer);
  }, [covered]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;
  const model = useMemo(() => {
    return buildRecordsScreen({
      observations: registro.observations,
      rides: registro.rides,
      snapshot: scheduleData,
      now: instant,
      lineFilter: null,
      expandedWeeks: new Set(),
    });
  }, [registro.observations, registro.rides, scheduleData, instant]);

  const hasPending = model.pendingTotal > 0;
  const accessibilityLabel = hasPending
    ? t("home.records_button.pending.a11y")
    : t("sheet_records.title");

  return (
    <View
      ref={button}
      collapsable={false}
      style={[
        styles.button,
        {
          top: insets.top + space.sm + (chosen === null ? 0 : BANNER_BAND),
        },
      ]}
    >
      <MapButton
        glyph={<RecordsGlyph color={colors.textSecondary} />}
        accessibilityLabel={accessibilityLabel}
        marker={hasPending}
        hidden={covered}
        onPress={() => {
          openedHere.current = true;
          dispatch({ type: "push", sheet: { kind: "records" } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: space.sm + minTouch + space.sm,
  },
});
