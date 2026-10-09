/**
 * "Guardar a localização deste ponto" (E-07 §3.2, D-107, T-69): linha discreta no detent grande da TL-02, só quando o domínio
 * oferece (3 registros ao vivo, com posição, no mesmo lugar e o ponto sem localização). Sem folha nova. Guardar confere a
 * coordenada (`validateLocation`), pergunta se fica longe de Leiria e mostra o toast com Desfazer; "Agora não" some até o
 * próximo registro naquele ponto.
 */
import { validateLocation } from "@notebus/domain";
import { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { usePositionPermission } from "../data/PositionProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useStopLocations } from "../data/StopLocationsProvider";
import { useToast } from "../data/ToastProvider";
import { locationOffer, toStopLocationRecords } from "../data/stopLocationOffer";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";

export function StopLocationOffer({ stopId }: { stopId: string }) {
  const { colors } = useTheme();
  const permission = usePositionPermission();
  const registro = useRegistro();
  const locations = useStopLocations();
  const toast = useToast();

  const offer = useMemo(() => {
    if (permission !== "granted" || locations.status !== "ready") return null;
    const hasLocation = locations.stops.some((s) => s.id === stopId);
    return locationOffer(toStopLocationRecords(registro.observations, stopId), stopId, hasLocation, locations.dismissed);
  }, [permission, locations.status, locations.stops, locations.dismissed, registro.observations, stopId]);

  if (!offer) return null;

  const failed = (body?: string) =>
    toast.show({
      title: t("toast.save_failed.title"),
      body: body ?? t("toast.save_failed.body"),
      kind: "error",
      haptic: "error",
    });

  const store = async () => {
    try {
      await locations.save(stopId, offer.point);
      toast.show({
        title: t("stop.location_offer.saved"),
        action: {
          label: t("toast.action.undo"),
          run: () => void locations.clear(stopId).catch(() => failed()),
        },
      });
    } catch {
      failed();
    }
  };

  const save = () => {
    const check = validateLocation(offer.point, offer.accuracyM, "suggested");
    if (!check.ok) {
      if (check.reason === "imprecise") {
        return failed(t("stop.location_offer.imprecise", { m: Math.round(offer.accuracyM ?? 0) }));
      }
      return failed();
    }
    if ("farFromLeiria" in check) {
      Alert.alert(t("stop.location_offer.far"), undefined, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("stop.location_offer.save"), onPress: () => void store() },
      ]);
      return;
    }
    void store();
  };

  const later = () => void locations.dismiss(stopId, offer.recordIds[0]!);

  return (
    <View style={[styles.box, { borderColor: colors.divider }]}>
      <Text accessibilityRole="header" style={[type.bodyStrong, { color: colors.text }]}>
        {t("stop.location_offer.title")}
      </Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{t("stop.location_offer.body", { count: offer.count })}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stop.location_offer.save.a11y")}
          onPress={save}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.subtitle, { color: colors.accent }]}>{t("stop.location_offer.save")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stop.location_offer.later.a11y")}
          onPress={later}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.subtitle, { color: colors.textSecondary }]}>{t("stop.location_offer.later")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 2, borderRadius: radius.md, borderWidth: 1, paddingVertical: space.sm, paddingHorizontal: space.md },
  actions: { flexDirection: "row", gap: space.md },
  button: { minHeight: minTouch, minWidth: minTouch, justifyContent: "center" },
});
