/**
 * TL-04 Repetir aviso de saída (E-06 Bloco 3, Item 3; Q-99 = A).
 *
 * Folha empilhada de um detent, sem HiddenBelowSpacer, quadro da VerifySheet (D-150).
 * - Título "Repetir" e resumo vivo em tempo real.
 * - Lista de atalhos (Só hoje, Todo dia, Seg a sex, Toda semana às [dia], Personalizado).
 * - Personalizado abre os 7 chips de dias (tone="ring", alvo 44 pt, VoiceOver completo).
 * - "Até" aparece com repetição: "Sem fim" (padrão) ou "Uma data" (seletor nativo, D-054).
 * - Botão "Pronto" fecha a folha. Cada toque grava imediatamente.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { dayOfWeek, formatServiceMinute } from "@notebus/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lisbonDateText } from "../data/BackupProvider";
import { useToast } from "../data/ToastProvider";
import {
  alarmSummary,
  applyPreset,
  applyUntil,
  presetOf,
  toggleWeekday,
  weekdayFullKey,
  weekdayPluralKey,
  weekdayShortKey,
} from "../data/alarmsUi";
import { realNow } from "../data/clock";
import { sharedAlarms, type AlarmRow } from "../db/alarms";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { requestReschedule } from "../notifications/runtime";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { CheckGlyph } from "../ui/Glyphs";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function RepeatHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: RepeatHandle };

const WEEKDAY_CHIPS = [1, 2, 3, 4, 5, 6, 0] as const;

export function RepeatSheet({ id, alarmId }: { id: number; alarmId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const toast = useToast();
  const db = getSharedDb();

  const [handleHeight, setHandleHeight] = useState(0);
  const [alarm, setAlarm] = useState<AlarmRow | null>(null);
  const [allAlarms, setAllAlarms] = useState<AlarmRow[]>([]);
  const [customMode, setCustomMode] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadAlarm = useCallback(async () => {
    if (!db) return;
    try {
      const repo = sharedAlarms(db);
      const row = await repo.getAlarm(alarmId);
      const list = await repo.listAlarms();
      setAllAlarms(list);
      if (row) {
        setAlarm(row);
        const preset = presetOf(row.weekdays, row.onceDate, row.validFrom);
        if (preset === "custom") {
          setCustomMode(true);
        }
      } else {
        close();
      }
    } catch {
      // Ignora erro
    }
  }, [alarmId, close, db]);

  useEffect(() => {
    void loadAlarm();
  }, [loadAlarm]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const saveChanges = useCallback(
    async (weekdays: number[], onceDate: string | null, validTo: string | null) => {
      if (!alarm || !db) return;
      try {
        const repo = sharedAlarms(db);
        const saveResult = await repo.saveAlarm(
          {
            ...alarm,
            weekdays,
            onceDate,
            validTo,
            id: alarm.id,
          },
          realNow(),
        );
        requestReschedule();
        setAlarm(saveResult.alarm);

        if (saveResult.replaced.length > 0) {
          const rep = saveResult.replaced[0]!;
          const oldAlarm = allAlarms.find((a) => a.id === rep.alarmId);
          const repDays =
            rep.weekdays.length > 0
              ? rep.weekdays.map((d) => t(weekdayPluralKey(d))).join(" ")
              : t("alarm.repeat.once");
          const repTime = oldAlarm ? formatServiceMinute(oldAlarm.anchorBaseMinute) : "";
          toast.show({
            title: t("toast.alarm_replaced", { time: repTime, days: repDays }),
            action: {
              label: t("toast.action.undo"),
              run: async () => {
                try {
                  await saveResult.undo(realNow());
                  requestReschedule();
                  await loadAlarm();
                } catch {
                  toast.show({
                    title: t("alarms.undo_failed"),
                    kind: "error",
                  });
                }
              },
            },
          });
        }
      } catch {
        // Falha de gravação
      }
    },
    [alarm, allAlarms, db, loadAlarm, toast],
  );

  if (!alarm) return null;

  const currentPreset = presetOf(alarm.weekdays, alarm.onceDate, alarm.validFrom);
  const serviceWeekday = dayOfWeek(alarm.validFrom);
  const isRepeating = alarm.weekdays.length > 0;

  const handleSelectPreset = async (preset: "once" | "daily" | "weekdays" | "weekly" | "custom") => {
    if (preset === "custom") {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    const result = applyPreset(preset, alarm.validFrom);
    const validTo = preset === "once" ? null : alarm.validTo;
    await saveChanges(result.weekdays, result.onceDate, validTo);
  };

  const handleToggleDay = async (day: number) => {
    const result = toggleWeekday(alarm.weekdays, day, alarm.validFrom);
    if (result.weekdays.length === 0) {
      setCustomMode(false);
      await saveChanges([], result.onceDate, null);
    } else {
      await saveChanges(result.weekdays, null, alarm.validTo);
    }
  };

  const handleUntilNone = async () => {
    await saveChanges(alarm.weekdays, alarm.onceDate, null);
  };

  const minDate = new Date(`${alarm.validFrom}T12:00:00Z`);
  const initialPickerDate = alarm.validTo
    ? new Date(`${alarm.validTo}T12:00:00Z`)
    : minDate;

  const handleDatePicked = async (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    await saveChanges(alarm.weekdays, alarm.onceDate, iso);
  };

  const presets = [
    { key: "once" as const, label: t("alarm.repeat.once"), selected: !customMode && currentPreset === "once" },
    { key: "daily" as const, label: t("alarm.repeat.daily"), selected: !customMode && currentPreset === "daily" },
    { key: "weekdays" as const, label: t("alarm.repeat.weekdays"), selected: !customMode && currentPreset === "weekdays" },
    {
      key: "weekly" as const,
      label: t("alarm.repeat.weekly", { day: t(weekdayPluralKey(serviceWeekday)) }),
      selected: !customMode && currentPreset === "weekly",
    },
    { key: "custom" as const, label: t("alarm.repeat.custom"), selected: customMode || currentPreset === "custom" },
  ];

  const dateDisplay = alarm.validTo
    ? lisbonDateText(Date.parse(`${alarm.validTo}T12:00:00Z`))
    : "";

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            style={{ height: scrollAreaHeight }}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. Título e Resumo Vivo */}
            <View style={styles.header}>
              <Text style={[type.title, { color: colors.text }]}>{t("alarm.repeat.title")}</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {alarmSummary(alarm.weekdays, alarm.validTo)}
              </Text>
            </View>

            {/* 2 & 3. Lista de Atalhos ou Chips Personalizados */}
            {!customMode ? (
              <View style={styles.presetsList}>
                {presets.map((p) => (
                  <Pressable
                    key={p.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: p.selected }}
                    accessibilityLabel={p.label}
                    onPress={() => void handleSelectPreset(p.key)}
                    style={({ pressed }) => [
                      styles.presetRow,
                      { borderBottomColor: colors.divider },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>{p.label}</Text>
                    {p.selected ? <CheckGlyph color={colors.accent} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.customContainer}>
                {/* Botão para voltar aos atalhos */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("alarm.repeat.back")}
                  onPress={() => setCustomMode(false)}
                  style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[type.label, { color: colors.accent }]}>
                    {`← ${t("alarm.repeat.back")}`}
                  </Text>
                </Pressable>

                {/* 7 Chips de Dias da Semana */}
                <View style={styles.chipsRow}>
                  {WEEKDAY_CHIPS.map((d) => {
                    const isSelected = alarm.weekdays.includes(d);
                    const shortName = t(weekdayShortKey(d));
                    const capitalized =
                      shortName.charAt(0).toUpperCase() + shortName.slice(1);
                    return (
                      <Chip
                        key={d}
                        tone="ring"
                        selected={isSelected}
                        label={capitalized}
                        minWidth={44}
                        accessibilityLabel={t(weekdayFullKey(d))}
                        onPress={() => void handleToggleDay(d)}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {/* 4. "Até" aparece sempre que há repetição */}
            {isRepeating && (
              <View style={styles.untilSection}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("alarm.repeat.until")}
                </Text>
                <View style={styles.untilList}>
                  {/* Sem fim */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: alarm.validTo === null }}
                    accessibilityLabel={t("alarm.repeat.until_none")}
                    onPress={() => void handleUntilNone()}
                    style={({ pressed }) => [
                      styles.presetRow,
                      { borderBottomColor: colors.divider },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {t("alarm.repeat.until_none")}
                    </Text>
                    {alarm.validTo === null ? <CheckGlyph color={colors.accent} /> : null}
                  </Pressable>

                  {/* Uma data */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: alarm.validTo !== null }}
                    accessibilityLabel={
                      alarm.validTo !== null
                        ? `${t("alarm.repeat.until_date")}, ${dateDisplay}`
                        : t("alarm.repeat.until_date")
                    }
                    onPress={() => setShowDatePicker(true)}
                    style={({ pressed }) => [
                      styles.presetRow,
                      { borderBottomColor: colors.divider },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {alarm.validTo !== null
                        ? `${t("alarm.repeat.until_date")} (${dateDisplay})`
                        : t("alarm.repeat.until_date")}
                    </Text>
                    {alarm.validTo !== null ? <CheckGlyph color={colors.accent} /> : null}
                  </Pressable>
                </View>
              </View>
            )}

            {/* 5. Botão "Pronto" */}
            <View style={styles.doneWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("alarm.repeat.done")}
                onPress={close}
                style={({ pressed }) => [
                  styles.doneButton,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                  {t("alarm.repeat.done")}
                </Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </View>

        {/* DateTimePicker Nativo para "Uma data" */}
        {showDatePicker &&
          (Platform.OS === "ios" ? (
            <Modal
              transparent
              animationType="fade"
              visible={showDatePicker}
              onRequestClose={() => setShowDatePicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
                <Pressable
                  style={[styles.modalBox, { backgroundColor: colors.surface }]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <DateTimePicker
                    value={initialPickerDate}
                    mode="date"
                    display="inline"
                    minimumDate={minDate}
                    textColor={colors.text}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      if (date) {
                        void handleDatePicked(date);
                      }
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowDatePicker(false)}
                    style={[styles.modalDoneButton, { backgroundColor: colors.fill }]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.text }]}>
                      {t("alarm.repeat.done")}
                    </Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          ) : (
            <DateTimePicker
              value={initialPickerDate}
              mode="date"
              display="default"
              minimumDate={minDate}
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                setShowDatePicker(false);
                if (event.type === "set" && date) {
                  void handleDatePicked(date);
                }
              }}
            />
          ))}
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  header: {
    gap: space.xs,
    paddingTop: space.xs,
  },
  presetsList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  presetRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  customContainer: {
    gap: space.md,
  },
  backRow: {
    minHeight: minTouch,
    justifyContent: "center",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  untilSection: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  untilList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  doneWrapper: {
    paddingTop: space.md,
  },
  doneButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.md,
  },
  modalBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
  },
  modalDoneButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
