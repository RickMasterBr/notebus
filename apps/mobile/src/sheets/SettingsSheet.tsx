/**
 * Ajustes mínimo (D-151; E-03 §5: mais "Exportar backup", "Importar backup" e "Último backup", no mesmo estilo de linha).
 * Uma folha empilhada de uma altura com a linha "Versão". Sete batidas seguidas nela abrem o
 * seletor do relógio de teste (D-095). Com o relógio já ligado, a 7ª batida abre o seletor para trocar o instante (a
 * faixa vermelha continua sendo o jeito de desligar). O resto da TL-12 fica para a E-08.
 * Versão: o `version` do `app.json`; build: o curto do commit (`EXPO_PUBLIC_BUILD_SHA`, definido pelo `app.config.ts`).
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import appJson from "../../app.json";
import { lisbonDateText, useBackup } from "../data/BackupProvider";
import { realNow } from "../data/clock";
import { createTapCounter } from "../data/testClockPicker";
import { sharedAlarms } from "../db/alarms";
import { getSharedDb } from "../db/sharedDb";
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

  const [activeAlarmsCount, setActiveAlarmsCount] = useState(0);
  const db = getSharedDb();

  useEffect(() => {
    if (isTop && db) {
      void sharedAlarms(db)
        .listAlarms()
        .then((list) => {
          setActiveAlarmsCount(list.filter((a) => a.enabled).length);
        });
    }
  }, [isTop, db]);

  const backup = useBackup();
  const last = backup.lastExportAt === null ? t("settings.never_exported") : t("settings.last_backup", { date: lisbonDateText(backup.lastExportAt) });

  return (
    <StackedSheet id={id}>
      <Text accessibilityRole="header" style={[type.title, styles.title, { color: colors.text }]}>
        {t("settings.title")}
      </Text>
      <ListRow
        title={t("places.title")}
        accessibilityLabel={t("places.title")}
        onPress={() => dispatch({ type: "push", sheet: { kind: "places" } })}
      />
      <ListRow
        title={t("alarms.title")}
        detail={t("alarms.on_count", { count: activeAlarmsCount })}
        accessibilityLabel={`${t("alarms.title")}. ${t("alarms.on_count", { count: activeAlarmsCount })}`}
        onPress={() => dispatch({ type: "push", sheet: { kind: "alarms" } })}
      />
      <ListRow
        title={t("settings.export_backup")}
        detail={last}
        accessibilityLabel={t("settings.export_backup.a11y", { last })}
        onPress={backup.exportNow}
      />
      <ListRow
        title={t("settings.import_backup")}
        accessibilityLabel={`${t("settings.import_backup")}. ${t("settings.import_backup.hint")}`}
        onPress={() =>
          void backup.startImport().then((picked) => {
            if (picked) dispatch({ type: "push", sheet: { kind: "backupImport" } });
          })
        }
      />
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
