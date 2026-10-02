/**
 * TL-13 Primeiro uso (4.5 §8.5, D-066). Sem imagem de referência: montada do texto da 4.5, dos tokens da 4.4 e dos
 * componentes 5.4 (cartão) e 5.10 (selo). Textos todos do catálogo (4.6).
 */
import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { radius, space, type, useTheme } from "../theme";

/** O que o cartão mostra antes de o arquivo ser escolhido (a TL-13 da 4.5: "9 linhas … 01/09/2026"). */
const MOBILIS_DETAIL = { count: 9, date: "01/09/2026" };

export function FirstRun({
  onImport,
  onStartEmpty,
}: {
  /** Abre o seletor e importa. `onCount` recebe o número de linhas do arquivo; devolve `true` se entrou. */
  onImport: (onCount: (lines: number) => void) => Promise<"done" | "cancelled" | "failed">;
  onStartEmpty: () => void;
}) {
  const { colors } = useTheme();
  const [importing, setImporting] = useState<number | "picking" | null>(null);
  const [failed, setFailed] = useState(false);

  async function startImport() {
    if (importing !== null) return;
    setFailed(false);
    setImporting("picking");
    const result = await onImport((lines) => setImporting(lines));
    // "done": a tela some (o app troca de fase); nos outros casos o cartão volta ao normal.
    if (result !== "done") setImporting(null);
    if (result === "failed") setFailed(true);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <Text style={[type.wordmark, { color: colors.text }]}>NoteBus</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>{t("first_run.tagline")}</Text>
        <View style={styles.spacer} />
        <Text style={[type.subtitle, { color: colors.text }]}>{t("first_run.question")}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: importing !== null }}
          onPress={startImport}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1.5 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[type.caption, { color: colors.textSecondary }]}>{t("first_run.recommended")}</Text>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{t("first_run.import_mobilis")}</Text>
          {typeof importing === "number" ? (
            <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={[type.caption, styles.num, { color: colors.textSecondary }]}>
              {t("first_run.importing", { count: importing })}
            </Text>
          ) : (
            <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
              {t("first_run.import_mobilis.detail", MOBILIS_DETAIL)}
            </Text>
          )}
          {failed ? <Text style={[type.caption, { color: colors.danger }]}>{t("toast.save_failed.title")}</Text> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onStartEmpty}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: 1 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[type.bodyStrong, { color: colors.text }]}>{t("first_run.start_empty")}</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{t("first_run.start_empty.detail")}</Text>
        </Pressable>

        <Text style={[type.caption, styles.privacy, { color: colors.textSecondary }]}>{t("first_run.privacy")}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: space.lg, paddingTop: space.xl * 2, gap: space.md },
  spacer: { flex: 1 },
  card: { borderRadius: radius.md, padding: space.md, gap: space.xs },
  num: { fontVariant: ["tabular-nums"] },
  privacy: { textAlign: "center" },
});
