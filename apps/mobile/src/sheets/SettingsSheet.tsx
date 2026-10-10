/**
 * TL-12 Ajustes completo (E-08 Bloco 1b, Item 3; plano §3, D-114, D-115).
 *
 * Folha empilhada com rolagem (moldura da AlarmsSheet, D-150, sem constante nova).
 * Seções em lista agrupada na ordem do plano:
 * 1. Lugares (topo, antes de Geral)
 * 2. Geral (margem stepper −/+ com alvos ≥ 44 pt, stepMargin e acessibilidade)
 * 3. Dias (viagens por tipo, + Exceção, lista futuras/hoje, Passadas)
 * 4. Feriados (nacionais automático, switch municipais, lista dos feriados, + Feriado)
 * 5. Avisos (interruptor de avisos com aviso desligado, linha Avisos)
 * 6. Mapa (mapa sem internet)
 * 7. Dados (Exportar backup com backupDaysText, Importar backup)
 * 8. Rede (networkLine com versão e vigência, abre networkInfo)
 * 9. Sobre (Versão com 7 batidas no relógio real para abrir clockPicker)
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appJson from "../../app.json";
import { useBackup } from "../data/BackupProvider";
import { realNow } from "../data/clock";
import { useNow } from "../data/NowProvider";
import { useOfflineMap } from "../data/OfflineMapProvider";
import { megabytesText } from "../data/mapOfflineState";
import {
  offlineSettingsButtons,
  runOfflineSettingsAction,
} from "../data/offlineSettingsActions";
import { usePreferences } from "../data/PreferencesProvider";
import { useSchedule } from "../data/ScheduleProvider";
import {
  backupDaysText,
  dayTypeCounts,
  marginLimits,
  networkLine,
  stepMargin,
} from "../data/settingsView";
import { createTapCounter } from "../data/testClockPicker";
import { sharedAlarms } from "../db/alarms";
import { selectLive } from "../db/query";
import { dataset, network, timetable } from "../db/schema";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ListRow } from "../ui/ListRow";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { activeSheet } from "./stack";

const VERSION_TEXT = `${appJson.expo.version} (${process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D"})`;

const HeightContext = createContext<(height: number) => void>(() => {});

function SettingsHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: SettingsHandle };

export function SettingsSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { state, dispatch } = useSheets();
  const prefs = usePreferences();
  const now = useNow();
  const schedule = useSchedule();
  const isTop = activeSheet(state).id === id;
  const counter = useRef(createTapCounter()).current;
  const row = useRef<View>(null);
  const wasCovered = useRef(false);
  const [handleHeight, setHandleHeight] = useState(0);

  // Ao fechar o seletor, o foco do VoiceOver volta para a linha que o abriu.
  useEffect(() => {
    if (wasCovered.current && isTop && row.current) {
      AccessibilityInfo.sendAccessibilityEvent(row.current, "focus");
    }
    wasCovered.current = !isTop;
  }, [isTop]);

  const [activeAlarmsCount, setActiveAlarmsCount] = useState(0);
  const [networkInfoData, setNetworkInfoData] = useState<{
    dataset: { version: string; validFrom?: string | null } | null;
    network: { name: string } | null;
  }>({ dataset: null, network: null });

  const db = getSharedDb();

  useEffect(() => {
    if (isTop && db) {
      void sharedAlarms(db)
        .listAlarms()
        .then((list) => {
          setActiveAlarmsCount(list.filter((a) => a.enabled).length);
        });

      void Promise.all([
        selectLive(db, dataset),
        selectLive(db, network),
        selectLive(db, timetable),
      ]).then(([datasets, networks, timetables]) => {
        const latestDataset = datasets[datasets.length - 1] ?? null;
        const currentNetwork = networks[0] ?? null;
        const validFrom = timetables[0]?.validFrom ?? null;
        if (latestDataset) {
          setNetworkInfoData({
            dataset: { version: latestDataset.version, validFrom },
            network: currentNetwork ? { name: currentNetwork.name } : null,
          });
        }
      });
    }
  }, [isTop, db]);

  // Margem local para feedback imediato e reversão em caso de recusa
  const [margin, setMargin] = useState(prefs.margin);
  useEffect(() => {
    setMargin(prefs.margin);
  }, [prefs.margin]);

  const handleStepMargin = (dir: 1 | -1) => {
    const next = stepMargin(margin, dir);
    if (next.value === margin) return;
    const prev = margin;
    setMargin(next.value);
    void prefs.setMargin(next.value).then((ok) => {
      if (!ok) setMargin(prev);
    });
  };

  const backup = useBackup();
  const backupDays = backupDaysText(backup.lastExportAt, now());

  const offlineMap = useOfflineMap();
  const offlineDetail = (() => {
    switch (offlineMap.status.kind) {
      case "none":
        return t("settings.offline_map.not_downloaded");
      case "downloading":
        return t("settings.offline_map.downloading", { percent: offlineMap.status.percent });
      case "ready":
        return t("settings.offline_map.ready", { mb: megabytesText(offlineMap.status.bytes) });
      case "error":
        return t("settings.offline_map.failed");
    }
  })();

  const onPressOfflineMap = () => {
    const buttons = offlineSettingsButtons(offlineMap.status);
    if (buttons.length === 0) return;

    Alert.alert(
      t("settings.offline_map.alert.title"),
      undefined,
      buttons.map((b) => ({
        text: t(b.labelKey),
        style: b.style === "default" ? undefined : b.style,
        onPress: () => runOfflineSettingsAction(b.action, offlineMap),
      })),
    );
  };

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const limits = marginLimits(margin);
  const dayCounts = dayTypeCounts(schedule.status === "ready" ? schedule.data : null);
  const netLine = networkLine(networkInfoData.dataset, networkInfoData.network);

  const handleToggleAlarms = (val: boolean) => {
    if (!val) {
      void prefs.setAlarmsAllowed(false);
    } else {
      void prefs.setAlarmsAllowed(true).then((res) => {
        if (!res.ok) {
          dispatch({ type: "push", sheet: { kind: "alarmIntro", mode: "denied" } });
        }
      });
    }
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            style={{ height: scrollAreaHeight }}
            contentContainerStyle={styles.scrollContent}
          >
            <Text accessibilityRole="header" style={[type.title, styles.headerTitle, { color: colors.text }]}>
              {t("settings.title")}
            </Text>

            {/* 1. Lugares (topo, antes de Geral) */}
            <View style={styles.groupedList}>
              <ListRow
                title={t("places.title")}
                accessibilityLabel={t("places.title")}
                onPress={() => dispatch({ type: "push", sheet: { kind: "places" } })}
              />
            </View>

            {/* 2. Geral */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.general")}
              </Text>
              <View style={styles.groupedList}>
                <View
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("settings.margin.a11y", { n: margin })}
                  accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                  onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === "increment") {
                      handleStepMargin(1);
                    } else if (e.nativeEvent.actionName === "decrement") {
                      handleStepMargin(-1);
                    }
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
              </View>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.margin.hint")}
              </Text>
            </View>

            {/* 3. Dias */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.days")}
              </Text>
              <View style={styles.groupedList}>
                <ListRow
                  title={t("settings.day.weekday")}
                  detail={t("settings.day.trips", { n: dayCounts.weekday })}
                  accessibilityLabel={`${t("settings.day.weekday")}. ${t("settings.day.trips", { n: dayCounts.weekday })}`}
                />
                <ListRow
                  title={t("settings.day.saturday")}
                  detail={t("settings.day.trips", { n: dayCounts.saturday })}
                  accessibilityLabel={`${t("settings.day.saturday")}. ${t("settings.day.trips", { n: dayCounts.saturday })}`}
                />
                <ListRow
                  title={t("settings.day.sunday_holiday")}
                  detail={t("settings.day.trips", { n: dayCounts.sunday_holiday })}
                  accessibilityLabel={`${t("settings.day.sunday_holiday")}. ${t("settings.day.trips", { n: dayCounts.sunday_holiday })}`}
                />
                <ListRow
                  title={t("settings.override.add")}
                  accessibilityLabel={t("settings.override.add")}
                  onPress={() => dispatch({ type: "push", sheet: { kind: "override" } })}
                />
              </View>
            </View>

            {/* 4. Feriados */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.holidays")}
              </Text>
              <View style={styles.groupedList}>
                <ListRow
                  title={t("settings.holiday.national")}
                  accessibilityLabel={t("settings.holiday.national")}
                />
                <View style={[styles.switchRow, { borderBottomColor: colors.divider, backgroundColor: colors.bg }]}>
                  <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                    {t("settings.holiday.municipal")}
                  </Text>
                  <Switch
                    accessibilityLabel={t("settings.holiday.municipal")}
                    value={prefs.includeMunicipalHolidays}
                    onValueChange={(val) => void prefs.setIncludeMunicipalHolidays(val)}
                    trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                    thumbColor={colors.surface}
                  />
                </View>
                <ListRow
                  title={t("settings.holiday.add")}
                  accessibilityLabel={t("settings.holiday.add")}
                  onPress={() => dispatch({ type: "push", sheet: { kind: "holiday" } })}
                />
              </View>
            </View>

            {/* 5. Avisos */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.alerts")}
              </Text>
              <View style={styles.groupedList}>
                <View style={[styles.switchRow, { borderBottomColor: colors.divider, backgroundColor: colors.bg }]}>
                  <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                    {t("settings.alarms.allow")}
                  </Text>
                  <Switch
                    accessibilityLabel={t("settings.alarms.allow")}
                    value={prefs.alarmsAllowed}
                    onValueChange={handleToggleAlarms}
                    trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                    thumbColor={colors.surface}
                  />
                </View>
                <ListRow
                  title={t("alarms.title")}
                  detail={t("alarms.on_count", { count: activeAlarmsCount })}
                  accessibilityLabel={`${t("alarms.title")}. ${t("alarms.on_count", { count: activeAlarmsCount })}`}
                  onPress={() => dispatch({ type: "push", sheet: { kind: "alarms" } })}
                />
              </View>
              {!prefs.alarmsAllowed && (
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("settings.alarms.off_hint")}
                </Text>
              )}
            </View>

            {/* 6. Mapa */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.map")}
              </Text>
              <View style={styles.groupedList}>
                <ListRow
                  title={t("settings.offline_map.title")}
                  detail={offlineDetail}
                  accessibilityLabel={t("settings.offline_map.a11y", { estado: offlineDetail })}
                  onPress={onPressOfflineMap}
                />
              </View>
            </View>

            {/* 7. Dados */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.data")}
              </Text>
              <View style={styles.groupedList}>
                <ListRow
                  title={t("settings.export_backup")}
                  detail={backupDays.text}
                  accessibilityLabel={t("settings.export_backup.a11y", { last: backupDays.text })}
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
              </View>
            </View>

            {/* 8. Rede */}
            {netLine && (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("settings.section.network")}
                </Text>
                <View style={styles.groupedList}>
                  <ListRow
                    title={netLine}
                    accessibilityLabel={netLine}
                    onPress={() => dispatch({ type: "push", sheet: { kind: "networkInfo" } })}
                  />
                </View>
              </View>
            )}

            {/* 9. Sobre */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("settings.section.about")}
              </Text>
              <View style={styles.groupedList}>
                <ListRow
                  ref={row}
                  title={t("settings.version")}
                  secondary={VERSION_TEXT}
                  accessibilityLabel={`${t("settings.version")} ${VERSION_TEXT}`}
                  // As batidas contam no relógio real, nunca no de teste.
                  onPress={() => counter.tap(realNow()) && dispatch({ type: "push", sheet: { kind: "clockPicker" } })}
                />
              </View>
            </View>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  headerTitle: {
    paddingTop: space.xs,
  },
  section: {
    gap: space.xs,
  },
  groupedList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
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
  switchRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    gap: space.sm,
  },
});
