/**
 * Folha "Novo feriado" (TL-12, E-08 bloco 1b, Item 5).
 *
 * Permite cadastrar um feriado com nome, data, repetição anual e validação sob os campos.
 * Salva com useCalendarEdits().saveHoliday e fecha apenas em caso de sucesso.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { createContext, useContext, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendarEdits } from "../data/CalendarEditsProvider";
import { useNow } from "../data/NowProvider";
import {
  buildHolidayInput,
  formatOverrideDate,
  toLocalDateString,
} from "../data/settingsView";
import { createSubmitGuard } from "../data/submitGuard";
import { useToast } from "../data/ToastProvider";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function HolidayHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: HolidayHandle };

export function HolidaySheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const calendarEdits = useCalendarEdits();
  const now = useNow();
  const toast = useToast();

  const [handleHeight, setHandleHeight] = useState(0);
  const [name, setName] = useState("");
  const [chosenDate, setChosenDate] = useState(() => new Date(now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const dateString = toLocalDateString(chosenDate);
  const [isSaving, setIsSaving] = useState(false);
  const submitGuard = useRef(createSubmitGuard()).current;

  const handleSave = async () => {
    await submitGuard.run(async () => {
      setIsSaving(true);
      setNameError(null);
      setDateError(null);
      try {
        const nowMs = now();
        const result = await calendarEdits.saveHoliday(
          buildHolidayInput({
            name,
            date: dateString,
            recurring,
          }),
          nowMs,
        );

        if (result.ok) {
          toast.show({
            title: t("holiday.saved"),
            action: {
              label: t("toast.action.undo"),
              run: async () => {
                await result.undo(now());
              },
            },
          });
          close();
        } else {
          if (result.reason === "empty_name") {
            setNameError(t("holiday.error.name"));
          } else if (result.reason === "invalid_date") {
            setDateError(t("holiday.error.date"));
          }
        }
      } finally {
        setIsSaving(false);
      }
    });
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
              {t("holiday.title")}
            </Text>

            {/* 1. Nome */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("holiday.name")}
              </Text>
              <TextInput
                accessibilityLabel={t("holiday.name")}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  if (nameError) setNameError(null);
                }}
                placeholder={t("holiday.name")}
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
              {nameError && (
                <Text style={[type.caption, { color: colors.danger }]}>
                  {nameError}
                </Text>
              )}
            </View>

            {/* 2. Data */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("holiday.date")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("holiday.date")}: ${formatOverrideDate(dateString)}`}
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

            {/* 3. Repete todo ano */}
            <View style={styles.section}>
              <View style={[styles.switchRow, { borderBottomColor: colors.divider, backgroundColor: colors.bg }]}>
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                  {t("holiday.every_year")}
                </Text>
                <Switch
                  accessibilityLabel={t("holiday.every_year")}
                  value={recurring}
                  onValueChange={setRecurring}
                  trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                  thumbColor={colors.surface}
                />
              </View>
            </View>

            {/* 4. Botão Salvar */}
            <View style={styles.buttonWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("holiday.save")}
                disabled={isSaving}
                onPress={() => void handleSave()}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: colors.accent },
                  isSaving && { opacity: 0.4 },
                  pressed && !isSaving && { opacity: 0.8 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                  {t("holiday.save")}
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
  input: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    ...type.body,
  },
  pickerRow: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: space.md,
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
