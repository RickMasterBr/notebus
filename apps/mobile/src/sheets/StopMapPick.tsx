/**
 * Botão "Marcar no mapa" na folha do Ponto (StopSheet) (E-07 §3.2, §3.7, D-107).
 * Abre o seletor em tela cheia e grava com origem manual.
 */
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GeoPoint } from "@notebus/domain";
import { useStopLocations } from "../data/StopLocationsProvider";
import { useToast } from "../data/ToastProvider";
import { applyStopUndo, undoForStopLocation } from "../data/mapPick";
import { t } from "../i18n";
import { MapPicker } from "../screens/MapPicker";
import { minTouch, type, useTheme } from "../theme";

export function StopMapPick({ stopId }: { stopId: string }) {
  const { colors } = useTheme();
  const locations = useStopLocations();
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const failed = useCallback(
    (body?: string) =>
      toast.show({
        title: t("toast.save_failed.title"),
        body: body ?? t("toast.save_failed.body"),
        kind: "error",
        haptic: "error",
      }),
    [toast],
  );

  const existingStop = locations.stops.find((s) => s.id === stopId);
  const existingPoint: GeoPoint | null =
    existingStop && existingStop.lat !== null && existingStop.lon !== null
      ? { lat: existingStop.lat, lon: existingStop.lon }
      : null;

  const handleConfirm = useCallback(
    async (p: GeoPoint) => {
      setPickerOpen(false);
      const previous = locations.stops.find((s) => s.id === stopId) ?? null;
      try {
        await locations.save(stopId, p, "manual");
        const undo = undoForStopLocation(previous);
        toast.show({
          title: t("stop.location_offer.saved"),
          action: {
            label: t("toast.action.undo"),
            run: () => {
              void applyStopUndo(undo, stopId, locations).catch(() => failed());
            },
          },
        });
      } catch {
        failed();
      }
    },
    [failed, locations, stopId, toast],
  );

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("map_pick.open.stop.a11y")}
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.subtitle, { color: colors.accent }]}>
          {t("map_pick.open")}
        </Text>
      </Pressable>
      <MapPicker
        visible={pickerOpen}
        existing={existingPoint}
        onCancel={() => setPickerOpen(false)}
        onConfirm={handleConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
  },
  button: {
    minHeight: minTouch,
    justifyContent: "center",
  },
});
