/**
 * Prévia da importação do backup (E-03 §5.4): folha curta da pilha existente, com "verificando", o erro (o que falhou,
 * nada foi gravado) ou a prévia "Backup de 25/10/2026, 412 registros, 3 lugares. MOBILIS 2026-09-01", o que entra e o
 * que fica, quantos órfãos (D-122), e os botões Importar e Cancelar. Sem lista: os órfãos aparecem só pela contagem,
 * então não há rolagem (a receita D-150/D-152 não se aplica). Estilo da folha do relógio de teste (D-151): tokens,
 * botão cheio de 44 pt; Cancelar em texto. Ordem de leitura do VoiceOver = ordem na tela (título, texto, Importar, Cancelar).
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBackup } from "../data/BackupProvider";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { StackedSheet, useCloseSheet } from "./StackedSheet";

export function BackupImportSheet({ id }: { id: number }) {
  return (
    <StackedSheet id={id}>
      <Content />
    </StackedSheet>
  );
}

function Content() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const close = useCloseSheet();
  const { importSheet, confirmImport, cancelImport } = useBackup();
  const title = useRef<Text>(null);

  // O resultado da verificação muda o texto: o VoiceOver volta ao título para ler de novo.
  useEffect(() => {
    if (title.current && importSheet?.status !== "checking") AccessibilityInfo.sendAccessibilityEvent(title.current, "focus");
  }, [importSheet?.status]);

  const cancel = () => {
    cancelImport();
    close();
  };
  const text = (s: string, color = colors.text) => <Text style={[type.body, styles.text, { color }]}>{s}</Text>;

  let body;
  if (importSheet === null || importSheet.status === "checking") {
    body = text(t("backup.preview.checking"), colors.textSecondary);
  } else if (importSheet.status === "error") {
    body = (
      <>
        {text(t("backup.preview.error_title"), colors.danger)}
        {text(importSheet.message)}
      </>
    );
  } else {
    const p = importSheet.preview;
    body = (
      <>
        {text(t("backup.preview.summary", { date: p.date, records: p.records, places: p.places, datasets: p.datasets.join(", ") }))}
        {text(t("backup.preview.merge", { inserted: p.merge.inserted, replaced: p.merge.replaced, kept: p.merge.kept }), colors.textSecondary)}
        {p.orphans.length > 0 ? text(t("backup.preview.orphans", { count: p.orphans.length }), colors.textSecondary) : null}
      </>
    );
  }

  return (
    <View style={{ paddingBottom: insets.bottom + space.md }}>
      <Text ref={title} accessibilityRole="header" style={[type.title, styles.title, { color: colors.text }]}>
        {t("backup.preview.title")}
      </Text>
      <View accessibilityLiveRegion="polite">{body}</View>
      {importSheet?.status === "ready" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            confirmImport();
            close();
          }}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && styles.pressed]}
        >
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("backup.preview.import")}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={cancel} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
        <Text style={[type.subtitle, { color: colors.accent }]}>{t("backup.preview.cancel")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingBottom: space.sm },
  text: { paddingBottom: space.sm },
  button: { minHeight: minTouch, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, marginTop: space.md },
  textButton: { minHeight: minTouch, alignItems: "center", justifyContent: "center", marginTop: space.xs },
  pressed: { opacity: 0.6 },
});
