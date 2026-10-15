/**
 * TL-12 Ajustes reorganizado como índice e páginas internas (E-08.5 Bloco 15, D-206, D-207).
 *
 * Folha empilhada com rolagem (quadro D-150, snapPoints 82%).
 * Índice de 5 grupos na raiz:
 * 1. Você (Meu nome -> página name, Lugares -> places)
 * 2. Horários (Margem -> página margin, Tipos de dia -> página days, Feriados -> página holidays)
 * 3. Avisos (Permitir avisos de saída com switch, Avisos ligados -> alarms)
 * 4. Rede e mapa (Linhas e pontos -> network, rede ativa -> networkInfo, Mapa sem internet -> página map)
 * 5. Dados (Backup -> página backup, Versão com 7 batidas no relógio real)
 */
import { dayTypeOf, lisbonWallClock } from "@notebus/domain";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, SlideInRight } from "react-native-reanimated";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appJson from "../../app.json";
import { alarmsSwitchDecision } from "../data/alarmsSwitchFlow";
import { useBackup } from "../data/BackupProvider";
import { useCalendarEdits } from "../data/CalendarEditsProvider";
import { realNow } from "../data/clock";
import { useNow } from "../data/NowProvider";
import { useOfflineMap } from "../data/OfflineMapProvider";
import { megabytesText } from "../data/mapOfflineState";
import {
  offlineSettingsButtons,
  offlineSettingsHint,
  runOfflineSettingsAction,
} from "../data/offlineSettingsActions";
import { MarginStepper } from "./MarginStepper";
import { usePlaces } from "../data/PlacesProvider";
import { usePreferences } from "../data/PreferencesProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useUserName } from "../data/UserNameProvider";
import {
  deleteHolidayWithUndo,
  deleteOverrideWithUndo,
  toggleAlarms,
} from "../data/settingsActions";
import {
  backupDaysText,
  currentValidFrom,
  dayTypeCounts,
  formatHolidayLine,
  formatOverrideLine,
  networkLine,
  splitOverrides,
} from "../data/settingsView";
import { greetingText } from "../data/greeting";
import {
  normalizeUserName,
  settingsHandle,
  settingsIndexView,
  settingsNavReduce,
  settingsPageTitle,
  type SettingsPage,
} from "../data/settingsIndex";
import { createTapCounter } from "../data/testClockPicker";
import { useToast } from "../data/ToastProvider";
import { sharedAlarms } from "../db/alarms";
import {
  type CalendarHolidayItem,
  type CalendarOverrideItem,
  listHolidays,
  listOverrides,
} from "../db/calendarList";
import { selectLive } from "../db/query";
import { dataset, network, timetable } from "../db/schema";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { expoPort } from "../notifications/expoPort";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph } from "../ui/Glyphs";
import { ListRow } from "../ui/ListRow";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { activeSheet } from "./stack";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { useReduceMotion } from "./useReduceMotion";

const VERSION_TEXT = `${appJson.expo.version} (${process.env.EXPO_PUBLIC_BUILD_SHA ?? "N/D"})`;

const HeightContext = createContext<(height: number) => void>(() => {});

interface SettingsNavContextValue {
  page: SettingsPage;
  onBack: () => void;
}

const SettingsNavContext = createContext<SettingsNavContextValue>({
  page: "root",
  onBack: () => {},
});

function SettingsHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const { page, onBack } = useContext(SettingsNavContext);
  const handleInfo = settingsHandle(page);

  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="close"
        hideCloseButton={!handleInfo.showClose}
        onPress={handleInfo.press === "close" ? onClose : onBack}
      />
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

  const reduceMotion = useReduceMotion();
  const keyboardHeight = useKeyboardHeight();
  const [page, dispatchNav] = useReducer(settingsNavReduce, "root");
  const handleBack = useCallback(() => dispatchNav({ type: "back" }), []);

  const { name: currentUserName, setName, clear } = useUserName();
  const [draftName, setDraftName] = useState(currentUserName ?? "");

  useEffect(() => {
    setDraftName(currentUserName ?? "");
  }, [currentUserName, page]);

  const places = usePlaces();
  const placeNames = useMemo(() => places.places.map((p) => p.name), [places.places]);

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
        const todayLisbon = lisbonWallClock(now()).date;
        const validFrom = currentValidFrom(timetables, todayLisbon);
        if (latestDataset) {
          setNetworkInfoData({
            dataset: { version: latestDataset.version, validFrom },
            network: currentNetwork ? { name: currentNetwork.name } : null,
          });
        }
      });
    }
  }, [isTop, db, now]);

  const calendarEdits = useCalendarEdits();
  const toast = useToast();
  const [overrides, setOverrides] = useState<CalendarOverrideItem[]>([]);
  const activeSwipeable = useRef<SwipeableMethods | null>(null);

  const loadOverrides = useCallback(async () => {
    if (!db) return;
    try {
      const list = await listOverrides(db);
      setOverrides(list);
    } catch {
      // Ignora erro
    }
  }, [db]);

  useEffect(() => {
    if (isTop) {
      void loadOverrides();
    }
  }, [isTop, schedule, loadOverrides]);

  const todayDate = lisbonWallClock(now()).date;
  const lisbonHour = Math.floor(lisbonWallClock(now()).minute / 60);
  const todayDayType =
    schedule.status === "ready"
      ? dayTypeOf(todayDate, schedule.data.calendar).dayType
      : null;

  const { upcoming: upcomingOverrides, pastCount } = splitOverrides(
    overrides,
    todayDate,
  );

  const handleDeleteOverride = async (item: CalendarOverrideItem) => {
    await deleteOverrideWithUndo({
      id: item.id,
      deleteOverride: (id, at) => calendarEdits.deleteOverride(id, at),
      now,
      toast,
      onSuccess: () => void loadOverrides(),
    });
  };

  const [holidays, setHolidays] = useState<CalendarHolidayItem[]>([]);

  const loadHolidays = useCallback(async () => {
    if (!db) return;
    try {
      const list = await listHolidays(db);
      setHolidays(list);
    } catch {
      // Ignora erro
    }
  }, [db]);

  useEffect(() => {
    if (isTop) {
      void loadHolidays();
    }
  }, [isTop, schedule, loadHolidays]);

  const handleDeleteHoliday = async (item: CalendarHolidayItem) => {
    await deleteHolidayWithUndo({
      id: item.id,
      deleteHoliday: (id, at) => calendarEdits.deleteHoliday(id, at),
      now,
      toast,
      onSuccess: () => void loadHolidays(),
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

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const dayCounts = dayTypeCounts(schedule.status === "ready" ? schedule.data : null);
  const netLine = networkLine(networkInfoData.dataset, networkInfoData.network);

  const handleToggleAlarms = (val: boolean) => {
    void toggleAlarms({
      next: val,
      decide: async (target) => alarmsSwitchDecision(await expoPort.getPermission(), target),
      setAlarmsAllowed: async (allowed) => {
        if (allowed) return prefs.setAlarmsAllowed(true);
        return prefs.setAlarmsAllowed(false);
      },
      openIntro: (options) => {
        if (options.mode === "denied") {
          dispatch({ type: "push", sheet: { kind: "alarmIntro", mode: "denied" } });
        } else {
          dispatch({
            type: "push",
            sheet: {
              kind: "alarmIntro",
              mode: "reason",
              onResolve: options.onResolve,
            },
          });
        }
      },
    });
  };

  const view = settingsIndexView({
    userName: currentUserName,
    placeNames,
    margin: prefs.margin,
    todayDayType,
    upcomingOverrides: upcomingOverrides.length,
    includeMunicipal: prefs.includeMunicipalHolidays,
    alarmsAllowed: prefs.alarmsAllowed,
    activeAlarms: activeAlarmsCount,
    networkName: networkInfoData.network?.name ?? null,
    offlineDetail,
    backupText: backupDays.text,
  });

  const handleSaveName = async () => {
    await setName(draftName);
    dispatchNav({ type: "back" });
  };

  const handleClearName = async () => {
    await clear();
    dispatchNav({ type: "back" });
  };

  const hasName = Boolean(normalizeUserName(draftName));

  return (
    <SettingsNavContext.Provider value={{ page, onBack: handleBack }}>
      <HeightContext.Provider value={setHandleHeight}>
        <StackedSheet id={id} detents={DETENTS}>
          <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              style={{ height: scrollAreaHeight }}
              contentContainerStyle={[
                styles.scrollContent,
                page === "name" && keyboardHeight > 0 && { paddingBottom: space.xl + keyboardHeight },
              ]}
            >
              {page === "root" && (
                <>
                  <Text accessibilityRole="header" style={[type.title, styles.headerTitle, { color: colors.text }]}>
                    {t("settings.title")}
                  </Text>

                  {/* 1. Grupo Você */}
                  <View style={styles.groupSection}>
                    <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                      {t("settings.group.you")}
                    </Text>
                    <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                      <SettingsIndexRow
                        title={t("settings.name.title")}
                        value={view.nameValue}
                        onPress={() => dispatchNav({ type: "open", page: "name" })}
                      />
                      <SettingsIndexRow
                        title={t("settings.places.row")}
                        value={view.placesValue}
                        borderBottom={false}
                        onPress={() => dispatch({ type: "push", sheet: { kind: "places" } })}
                      />
                    </View>
                  </View>

                  {/* 2. Grupo Horários */}
                  <View style={styles.groupSection}>
                    <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                      {t("settings.group.schedule")}
                    </Text>
                    <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                      <SettingsIndexRow
                        title={t("settings.margin.title")}
                        value={view.marginValue}
                        onPress={() => dispatchNav({ type: "open", page: "margin" })}
                      />
                      <SettingsIndexRow
                        title={t("settings.days.row")}
                        value={view.daysValue}
                        onPress={() => dispatchNav({ type: "open", page: "days" })}
                      />
                      <SettingsIndexRow
                        title={t("settings.holidays.row")}
                        value={view.holidaysValue}
                        borderBottom={false}
                        onPress={() => dispatchNav({ type: "open", page: "holidays" })}
                      />
                    </View>
                  </View>

                  {/* 3. Grupo Avisos */}
                  <View style={styles.groupSection}>
                    <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                      {t("settings.group.alerts")}
                    </Text>
                    <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                      <View
                        style={[
                          styles.switchRow,
                          { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth },
                        ]}
                      >
                        <View style={styles.switchRowContent}>
                          <Text style={[type.body, { color: colors.text, fontWeight: "500" }]}>
                            {t("settings.alarms.allow")}
                          </Text>
                          <Text style={[type.caption, { color: colors.textSecondary }]}>
                            {view.alertsHint}
                          </Text>
                        </View>
                        <Switch
                          accessibilityLabel={t("settings.alarms.allow")}
                          value={prefs.alarmsAllowed}
                          onValueChange={handleToggleAlarms}
                          trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                          thumbColor={colors.surface}
                        />
                      </View>
                      <SettingsIndexRow
                        title={t("settings.alarms.on_row")}
                        value={view.alertsCount}
                        valueRight
                        borderBottom={false}
                        onPress={() => dispatch({ type: "push", sheet: { kind: "alarms" } })}
                      />
                    </View>
                  </View>

                  {/* 4. Grupo Rede e mapa */}
                  <View style={styles.groupSection}>
                    <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                      {t("settings.group.network")}
                    </Text>
                    <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                      <SettingsIndexRow
                        title={t("settings.network.row")}
                        value={view.networkName}
                        borderBottom={Boolean(netLine) || true}
                        onPress={() => dispatch({ type: "push", sheet: { kind: "network" } })}
                      />
                      {netLine && (
                        <SettingsIndexRow
                          title={netLine}
                          onPress={() => dispatch({ type: "push", sheet: { kind: "networkInfo" } })}
                        />
                      )}
                      <SettingsIndexRow
                        title={t("settings.offline_map.title")}
                        value={view.mapValue}
                        borderBottom={false}
                        onPress={() => dispatchNav({ type: "open", page: "map" })}
                      />
                    </View>
                  </View>

                  {/* 5. Grupo Dados */}
                  <View style={styles.groupSection}>
                    <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                      {t("settings.group.data")}
                    </Text>
                    <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                      <SettingsIndexRow
                        title={t("settings.data.backup_row")}
                        value={view.backupValue}
                        onPress={() => dispatchNav({ type: "open", page: "backup" })}
                      />
                      <Pressable
                        ref={row}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`${t("settings.version")} ${VERSION_TEXT}`}
                        onPress={() =>
                          counter.tap(realNow()) && dispatch({ type: "push", sheet: { kind: "clockPicker" } })
                        }
                        style={[styles.indexRow, { minHeight: 56 }]}
                      >
                        <Text style={[type.body, { color: colors.text, fontWeight: "500", flex: 1 }]}>
                          {t("settings.version")}
                        </Text>
                        <Text style={[type.body, { color: colors.textSecondary }]}>
                          {VERSION_TEXT}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {page !== "root" && (
                <Animated.View
                  key={page}
                  entering={reduceMotion ? FadeIn.duration(200) : SlideInRight.duration(280)}
                  style={styles.pageContainer}
                >
                  {/* Botão ‹ Ajustes */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("settings.back.a11y")}
                      onPress={handleBack}
                      style={styles.backButton}
                    >
                      <View style={{ transform: [{ rotate: "180deg" }] }}>
                        <ChevronRightGlyph color={colors.accent} />
                      </View>
                      <Text style={[type.body, styles.backText, { color: colors.accent }]}>
                        {t("settings.back")}
                      </Text>
                    </Pressable>

                  <Text accessibilityRole="header" style={[type.title, styles.pageTitle, { color: colors.text }]}>
                    {t(settingsPageTitle(page))}
                  </Text>

                  {/* Página Meu nome */}
                  {page === "name" && (
                    <View style={styles.pageSection}>
                      <View style={styles.fieldBlock}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                          {t("settings.name.label")}
                        </Text>
                        <BottomSheetTextInput
                          value={draftName}
                          onChangeText={setDraftName}
                          placeholder={t("settings.name.placeholder")}
                          placeholderTextColor={colors.textSecondary}
                          accessibilityLabel={t("settings.name.label")}
                          autoFocus
                          maxLength={24}
                          autoComplete="given-name"
                          style={[
                            type.body,
                            styles.input,
                            {
                              color: colors.text,
                              borderColor: normalizeUserName(draftName) ? colors.accent : colors.divider,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        />
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("settings.name.hint")}
                        </Text>
                      </View>

                      <View style={[styles.previewCard, { backgroundColor: colors.highlight }]}>
                        <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                          {t("settings.name.preview_title")}
                        </Text>
                        <Text style={[type.title, { color: colors.text, fontSize: 20 }]}>
                          {greetingText({ hour: lisbonHour, name: normalizeUserName(draftName) })}
                        </Text>
                        <Text style={[type.caption, { color: colors.textSecondary, fontSize: 14 }]}>
                          {t("settings.name.preview_question")}
                        </Text>
                      </View>

                      <View style={styles.buttonStack}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("settings.name.save")}
                          onPress={handleSaveName}
                          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                        >
                          <Text style={[type.bodyStrong, { color: colors.onAccent, fontSize: 17 }]}>
                            {t("settings.name.save")}
                          </Text>
                        </Pressable>

                        {hasName ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t("settings.name.clear")}
                            onPress={handleClearName}
                            style={styles.dangerButton}
                          >
                            <Text style={[type.bodyStrong, { color: colors.danger, fontSize: 16 }]}>
                              {t("settings.name.clear")}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  )}

                  {/* Página Margem */}
                  {page === "margin" && (
                    <View style={styles.pageSection}>
                      <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                        <MarginStepper />
                      </View>
                      <Text style={[type.caption, { color: colors.textSecondary, textAlign: "center" }]}>
                        {t("settings.margin.hint")}
                      </Text>
                    </View>
                  )}

                  {/* Página Tipos de dia */}
                  {page === "days" && (
                    <View style={styles.pageSection}>
                      <View style={styles.groupSection}>
                        <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                          {t("settings.days.mobilis")}
                        </Text>
                        <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
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
                        </View>
                      </View>

                      <View style={styles.groupSection}>
                        <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                          {t("settings.days.exceptions")}
                        </Text>
                        <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                          {upcomingOverrides.map((item) => (
                            <OverrideRow
                              key={item.id}
                              item={item}
                              onDelete={() => void handleDeleteOverride(item)}
                              onWillOpen={(methods) => {
                                activeSwipeable.current = openSingleSwipeable(activeSwipeable.current, methods);
                              }}
                              onClose={(methods) => {
                                if (activeSwipeable.current === methods) {
                                  activeSwipeable.current = closeAndClearSwipeable(activeSwipeable.current);
                                }
                              }}
                            />
                          ))}
                          {pastCount > 0 && (
                            <ListRow
                              title={t("settings.override.past", { n: pastCount })}
                              accessibilityLabel={t("settings.override.past", { n: pastCount })}
                              onPress={() => dispatch({ type: "push", sheet: { kind: "pastOverrides" } })}
                            />
                          )}
                          <ListRow
                            title={t("settings.override.add")}
                            accessibilityLabel={t("settings.override.add")}
                            onPress={() => dispatch({ type: "push", sheet: { kind: "override" } })}
                          />
                        </View>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("settings.days.exceptions_hint")}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Página Feriados */}
                  {page === "holidays" && (
                    <View style={styles.pageSection}>
                      <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
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
                      </View>

                      <View style={styles.groupSection}>
                        <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.textSecondary }]}>
                          {t("settings.holidays.yours")}
                        </Text>
                        <View style={[styles.groupBox, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                          {holidays.map((item) =>
                            item.scope === "manual" ? (
                              <HolidayRow
                                key={item.id}
                                item={item}
                                onDelete={() => void handleDeleteHoliday(item)}
                                onWillOpen={(methods) => {
                                  activeSwipeable.current = openSingleSwipeable(activeSwipeable.current, methods);
                                }}
                                onClose={(methods) => {
                                  if (activeSwipeable.current === methods) {
                                    activeSwipeable.current = closeAndClearSwipeable(activeSwipeable.current);
                                  }
                                }}
                              />
                            ) : (
                              <ListRow
                                key={item.id}
                                title={formatHolidayLine(item.name, item.date, item.recurring)}
                                detail={t("settings.holiday.official_note")}
                                accessibilityLabel={`${formatHolidayLine(item.name, item.date, item.recurring)}. ${t("settings.holiday.official_note")}`}
                              />
                            ),
                          )}
                          <ListRow
                            title={t("settings.holiday.add")}
                            accessibilityLabel={t("settings.holiday.add")}
                            onPress={() => dispatch({ type: "push", sheet: { kind: "holiday" } })}
                          />
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Página Mapa sem internet */}
                  {page === "map" && (
                    <View style={styles.pageSection}>
                      <View style={[styles.stateCard, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                        <Text style={[type.title, { color: colors.text, fontSize: 20 }]}>
                          {offlineDetail}
                        </Text>
                        {(() => {
                          const hintKey = offlineSettingsHint(offlineMap.status);
                          if (!hintKey) return null;
                          return (
                            <Text style={[type.caption, { color: colors.textSecondary }]}>
                              {t(hintKey)}
                            </Text>
                          );
                        })()}
                      </View>

                      {(() => {
                        const buttons = offlineSettingsButtons(offlineMap.status);
                        if (buttons.length === 0) return null;
                        return (
                          <View style={styles.buttonStack}>
                            {buttons.map((b) => (
                              <Pressable
                                key={b.action}
                                accessibilityRole="button"
                                accessibilityLabel={t(b.labelKey)}
                                onPress={() =>
                                  runOfflineSettingsAction(b.action, {
                                    startDownload: offlineMap.startDownload,
                                    deleteMap: offlineMap.deleteMap,
                                    goBack: handleBack,
                                  })
                                }
                                style={[
                                  styles.actionButton,
                                  b.style === "destructive"
                                    ? styles.dangerButton
                                    : [styles.fillButton, { backgroundColor: colors.fill }],
                                ]}
                              >
                                <Text
                                  style={[
                                    type.bodyStrong,
                                    { color: b.style === "destructive" ? colors.danger : colors.text, fontSize: 16 },
                                  ]}
                                >
                                  {t(b.labelKey)}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                  )}

                  {/* Página Backup */}
                  {page === "backup" && (
                    <View style={styles.pageSection}>
                      <View style={[styles.stateCard, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
                        <Text style={[type.title, { color: colors.text, fontSize: 20 }]}>
                          {backupDays.text}
                        </Text>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("settings.backup.hint")}
                        </Text>
                      </View>

                      <View style={styles.buttonStack}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("settings.export_backup.a11y", { last: backupDays.text })}
                          onPress={backup.exportNow}
                          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                        >
                          <Text style={[type.bodyStrong, { color: colors.onAccent, fontSize: 17 }]}>
                            {t("settings.export_backup")}
                          </Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t("settings.import_backup")}. ${t("settings.backup.import_hint")}`}
                          onPress={() =>
                            void backup.startImport().then((picked) => {
                              if (picked) dispatch({ type: "push", sheet: { kind: "backupImport" } });
                            })
                          }
                          style={[styles.fillButton, { backgroundColor: colors.fill }]}
                        >
                          <Text style={[type.bodyStrong, { color: colors.text, fontSize: 17 }]}>
                            {t("settings.import_backup")}
                          </Text>
                        </Pressable>
                      </View>

                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {t("settings.backup.import_hint")}
                      </Text>
                    </View>
                  )}
                </Animated.View>
              )}
            </BottomSheetScrollView>
          </View>
        </StackedSheet>
      </HeightContext.Provider>
    </SettingsNavContext.Provider>
  );
}

interface SettingsIndexRowProps {
  title: string;
  value?: string | number | null;
  valueRight?: boolean;
  borderBottom?: boolean;
  icon?: ReactNode;
  onPress: () => void;
}

function SettingsIndexRow({
  title,
  value,
  valueRight = false,
  borderBottom = true,
  icon,
  onPress,
}: SettingsIndexRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.indexRow,
        borderBottom && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      {valueRight ? (
        <View style={styles.rowRightContainer}>
          <Text style={[type.body, styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {value ? <Text style={[type.body, styles.rowValueRight, { color: colors.textSecondary }]}>{value}</Text> : null}
        </View>
      ) : (
        <View style={styles.rowStackedContainer}>
          <Text style={[type.body, styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {value ? <Text style={[type.caption, { color: colors.textSecondary }]}>{value}</Text> : null}
        </View>
      )}
      <ChevronRightGlyph color={colors.textSecondary} />
    </Pressable>
  );
}

function OverrideRow({
  item,
  onDelete,
  onWillOpen,
  onClose,
}: {
  item: CalendarOverrideItem;
  onDelete: () => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const lineText = formatOverrideLine(item.date, item.dayTypeCode);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClose(swipeableRef.current);
      }}
      renderRightActions={(_progress, _translation, swipeableMethods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("alarms.delete")}
          onPress={() => {
            swipeableMethods.close();
            onDelete();
          }}
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
            {t("alarms.delete")}
          </Text>
        </Pressable>
      )}
    >
      <View
        accessibilityRole="text"
        accessibilityLabel={lineText}
        accessibilityActions={[{ name: "delete", label: t("alarms.delete") }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") {
            onDelete();
          }
        }}
        style={[
          styles.overrideRow,
          { borderBottomColor: colors.divider, backgroundColor: colors.bg },
        ]}
      >
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>{lineText}</Text>
      </View>
    </ReanimatedSwipeable>
  );
}

function HolidayRow({
  item,
  onDelete,
  onWillOpen,
  onClose,
}: {
  item: CalendarHolidayItem;
  onDelete: () => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const lineText = formatHolidayLine(item.name, item.date, item.recurring);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClose(swipeableRef.current);
      }}
      renderRightActions={(_progress, _translation, swipeableMethods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("alarms.delete")}
          onPress={() => {
            swipeableMethods.close();
            onDelete();
          }}
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
        >
          <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
            {t("alarms.delete")}
          </Text>
        </Pressable>
      )}
    >
      <View
        accessibilityRole="text"
        accessibilityLabel={lineText}
        accessibilityActions={[{ name: "delete", label: t("alarms.delete") }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") {
            onDelete();
          }
        }}
        style={[
          styles.overrideRow,
          { borderBottomColor: colors.divider, backgroundColor: colors.bg },
        ]}
      >
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>{lineText}</Text>
      </View>
    </ReanimatedSwipeable>
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
  pageContainer: {
    gap: space.md,
  },
  pageTitle: {
    marginBottom: space.xs,
  },
  backButton: {
    height: minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: -4,
    paddingRight: space.sm,
  },
  backIcon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 17,
    fontWeight: "500",
  },
  groupSection: {
    gap: 6,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  groupBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  indexRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  rowIcon: {
    width: 32,
    height: 32,
  },
  rowStackedContainer: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowRightContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: space.xs,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  rowValueRight: {
    fontSize: 15,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  switchRowContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pageSection: {
    gap: space.md,
  },
  fieldBlock: {
    gap: space.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontSize: 17,
  },
  previewCard: {
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  stateCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  buttonStack: {
    gap: space.sm,
  },
  primaryButton: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  fillButton: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButton: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButton: {
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  overrideRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  deleteButton: {
    minWidth: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.md,
  },
});
