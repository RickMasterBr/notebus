/**
 * Cartão de oferta e progresso do mapa sem internet (E-07 7b Bloco 6b).
 * Fica na folha do Início (HomeSheet), no mesmo espaço do cartão da viagem e backup.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { radius, space, type, useTheme } from "../theme";
import { useOfflineMap } from "../data/OfflineMapProvider";

export function OfflineMapCard() {
  const { colors } = useTheme();
  const { status, estimatedMb, startDownload, snooze } = useOfflineMap();

  if (status.kind === "downloading") {
    return (
      <View style={[styles.card, { backgroundColor: colors.fill }]}>
        <Text style={[type.body, { color: colors.text }]}>
          {t("offline_map.downloading", { percent: status.percent })}
        </Text>
      </View>
    );
  }

  if (status.kind === "error") {
    return (
      <View style={[styles.card, { backgroundColor: colors.fill }]}>
        <Text style={[type.body, { color: colors.text }]}>
          {t("offline_map.error")}
        </Text>
        <View style={styles.actions}>
          <View style={styles.spacer} />
          <TextAction
            label={t("offline_map.button.retry")}
            a11yLabel={t("offline_map.button.retry.a11y")}
            color={colors.accent}
            onPress={startDownload}
          />
          <TextAction
            label={t("offline_map.button.snooze")}
            a11yLabel={t("offline_map.button.snooze.a11y")}
            color={colors.textSecondary}
            onPress={snooze}
          />
        </View>
      </View>
    );
  }

  // Oferta (status 'none')
  const mbFormatted = estimatedMb.toString().replace(".", ",");
  return (
    <View style={[styles.card, { backgroundColor: colors.fill }]}>
      <Text style={[type.body, { color: colors.text }]}>
        {t("offline_map.offer", { mb: mbFormatted })}
      </Text>
      <View style={styles.actions}>
        <View style={styles.spacer} />
        <TextAction
          label={t("offline_map.button.download")}
          a11yLabel={t("offline_map.button.download.a11y")}
          color={colors.accent}
          onPress={startDownload}
        />
        <TextAction
          label={t("offline_map.button.snooze")}
          a11yLabel={t("offline_map.button.snooze.a11y")}
          color={colors.textSecondary}
          onPress={snooze}
        />
      </View>
    </View>
  );
}

function TextAction({
  label,
  a11yLabel,
  color,
  onPress,
}: {
  label: string;
  a11yLabel?: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
    >
      <Text style={[type.subtitle, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  spacer: {
    flex: 1,
  },
  textAction: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
