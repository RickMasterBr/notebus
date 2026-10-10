/**
 * Folha "Exceção por data" (TL-12, E-08 bloco 1b, Item 4.1).
 *
 * Permite cadastrar uma exceção com data, tipo de dia ("Funciona como") e nota opcional.
 * Seletor nativo inline (iOS) / default (Android).
 * Salva com useCalendarEdits().saveOverride e fecha apenas em caso de sucesso.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { DayTypeCode } from "@notebus/domain";
import { createContext, useContext, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendarEdits } from "../data/CalendarEditsProvider";
import { useNow } from "../data/NowProvider";
import {
  formatOverrideDate,
  toLocalDateString,
} from "../data/settingsView";
import { dateNumbers } from "../data/testClockPicker";
import { useToast } from "../data/ToastProvider";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function OverrideHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: OverrideHandle };

const DAY_TYPES: { code: DayTypeCode; labelKey: "settings.day.weekday" | "settings.day.saturday" | "settings.day.sunday_holiday" }[] = [
  { code: "weekday", labelKey: "settings.day.weekday" },
  { code: "saturday", labelKey: "settings.day.saturday" },
  { code: "sunday_holiday", labelKey: "settings.day.sunday_holiday" },
];

export function OverrideSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const calendarEdits = useCalendarEdits();
  const now = useNow();
  const toast = useToast();

  const [handleHeight, setHandleHeight] = useState(0);
  const [chosenDate, setChosenDate] = useState(() => new Date(now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDayType, setSelectedDayType] = useState<DayTypeCode | null>(null);
  const [note, setNote] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const dateString = toLocalDateString(chosenDate);

  const handleSave = async () => {
    if (selectedDayType === null) return;
    setDateError(null);
    setGenericError(null);

    const nowMs = now();
    const result = await calendarEdits.saveOverride(
      {
        date: dateString,
        dayTypeCode: selectedDayType,
        note: note.trim() || null,
      },
      nowMs,
    );

    if (result.ok) {
      if (result.kind === "created") {
        toast.show({
          title: t("override.saved"),
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              await result.undo(now());
            },
          },
        });
        close();
      } else if (result.kind === "replaced") {
        toast.show({
          title: t("override.replaced", { date: dateNumbers(dateString) }),
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              await result.undo(now());
            },
          },
        });
        close();
      }
    } else {
      if (result.reason === "invalid_date") {
        setDateError(t("override.error.date"));
      } else {
        setGenericError(t("override.error.generic"));
      }
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
              {t("override.title")}
            </Text>

            {/* 1. Data */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("override.date")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("override.date")}: ${formatOverrideDate(dateString)}`}
                onPress={() => setShowDatePicker(true)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  { backgroundColor: colors.fill, borderColor: colors.divider },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {formatOverrideDate(dateString)}
                </Text>
              </Pressable>
              {dateError && (
                <Text style={[type.caption, { color: colors.danger }]}>
                  {dateError}
                </Text>
              )}
            </View>

            {/* 2. Funciona como */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("override.works_as")}
              </Text>
              <View style={styles.chipsRow}>
                {DAY_TYPES.map((dt) => (
                  <Chip
                    key={dt.code}
                    tone="ring"
                    selected={selectedDayType === dt.code}
                    label={t(dt.labelKey)}
                    minWidth={minTouch}
                    accessibilityLabel={t(dt.labelKey)}
                    onPress={() => setSelectedDayType(dt.code)}
                  />
                ))}
              </View>
            </View>

            {/* 3. Nota (opcional) */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("override.note")}
              </Text>
              <TextInput
                accessibilityLabel={t("override.note")}
                value={note}
                onChangeText={setNote}
                placeholder={t("override.note")}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.fill,
                    borderColor: colors.divider,
                  },
                ]}
              />
            </View>

            {genericError && (
              <Text style={[type.caption, { color: colors.danger }]}>
                {genericError}
              </Text>
            )}

            {/* 4. Botão Salvar */}
            <View style={styles.buttonWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("override.save")}
                disabled={selectedDayType === null}
                onPress={() => void handleSave()}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: colors.accent },
                  selectedDayType === null && { opacity: 0.4 },
                  pressed && selectedDayType !== null && { opacity: 0.8 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                  {t("override.save")}
                </Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </View>

        {/* DateTimePicker nativo */}
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
                    value={chosenDate}
                    mode="date"
                    display="inline"
                    textColor={colors.text}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      if (date) {
                        setChosenDate(date);
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
              value={chosenDate}
              mode="date"
              display="default"
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                setShowDatePicker(false);
                if (event.type === "set" && date) {
                  setChosenDate(date);
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
    gap: space.lg,
  },
  headerTitle: {
    paddingTop: space.xs,
  },
  section: {
    gap: space.xs,
  },
  pickerRow: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  input: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    ...type.body,
  },
  buttonWrapper: {
    paddingTop: space.sm,
  },
  saveButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.md,
  },
  modalBox: {
    borderRadius: radius.lg,
    padding: space.md,
    width: "100%",
    maxWidth: 360,
    gap: space.md,
  },
  modalDoneButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
