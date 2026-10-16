/**
 * Ajustes › Sobre (plano E-09 §3.7): versões, créditos exigidos por licença, lista de licenças gerada (T-90)
 * e aviso honesto. Toda decisão vem de `data/about.ts`; aqui só se desenha. Sem animação própria (a página já entra animada).
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import appJson from "../../app.json";
import { aboutView, licenseRows } from "../data/about";
import licenses from "../data/licenses.generated.json";
import { installedDatasets, schemaVersion } from "../db/backup";
import { expoImportDb } from "../db/open";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph } from "../ui/Glyphs";

const APP_VERSION = `${appJson.expo.version} (${process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D"})`;

export function AboutPage() {
  const { colors } = useTheme();
  const [schema, setSchema] = useState<number | null>(null);
  const [datasets, setDatasets] = useState<{ name: string; version: string }[] | null>(null);
  const [licensesOpen, setLicensesOpen] = useState(false);

  useEffect(() => {
    const db = getSharedDb();
    if (!db) return;
    const raw = expoImportDb(db.$client);
    void schemaVersion(raw).then(setSchema);
    void installedDatasets(raw).then(setDatasets);
  }, []);

  const view = aboutView({ appVersion: APP_VERSION, schemaVersion: schema, datasets });
  const rows = useMemo(() => (licensesOpen ? licenseRows(licenses.packages) : []), [licensesOpen]);
  const box = [styles.box, { borderColor: colors.divider, backgroundColor: colors.surface }];

  return (
    <View style={styles.page}>
      <View style={styles.group}>
        <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
          {t("settings.about.versions")}
        </Text>
        <View style={box}>
          <InfoRow label={t("settings.about.app_version")} value={view.appVersion} />
          <InfoRow label={t("settings.about.schema_version")} value={view.schemaVersion} />
          <InfoRow label={t("settings.about.data_version")} value={view.dataVersion} last />
        </View>
      </View>

      <View style={styles.group}>
        <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
          {t("settings.about.credits")}
        </Text>
        <View style={box}>
          <Text style={[type.body, styles.credit, { color: colors.text, borderBottomColor: colors.divider }]}>
            {view.creditHolidays}
          </Text>
          <Text style={[type.body, styles.credit, { color: colors.text, borderBottomColor: colors.divider }]}>
            {view.creditMap}
          </Text>
          <LinkRow
            title={t("settings.about.licenses")}
            accessibilityLabel={t("settings.about.licenses")}
            expanded={licensesOpen}
            last={!licensesOpen}
            onPress={() => setLicensesOpen((open) => !open)}
          />
          {rows.map((row, i) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={`${row.title}, ${row.detail}`}
              style={[
                styles.licenseRow,
                i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
              ]}
            >
              <Text style={[type.caption, { color: colors.text }]}>{row.title}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{row.detail}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.notice}>
        {view.noticeLines.map((line) => (
          <Text key={line} style={[type.caption, { color: colors.textSecondary }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={[styles.info, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
    >
      <Text style={[type.body, { color: colors.text }]}>{label}</Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

function LinkRow({
  title,
  accessibilityLabel,
  accessibilityHint,
  expanded,
  last,
  onPress,
}: {
  title: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  expanded?: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[type.body, styles.linkTitle, { color: colors.text }]}>{title}</Text>
      <ChevronRightGlyph color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  group: { gap: 6 },
  groupTitle: { fontSize: 13, fontWeight: "600" },
  box: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  info: { minHeight: minTouch, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },
  credit: { paddingVertical: space.sm, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  link: { minHeight: minTouch, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
  linkTitle: { flex: 1, fontWeight: "500" },
  licenseRow: { paddingVertical: space.xs, paddingHorizontal: space.md, gap: 2 },
  notice: { gap: space.xs },
});
