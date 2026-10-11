/**
 * TL-07 Declarar horário (E-08 §4; 4.1 §15a; 4.4 §5.8 chips, §5.12 lista, §5.14 seletor de hora; `DESIGN.md`).
 *
 * Campos, na ordem: Linha (já escolhida se o ponto tem só uma), Hora (seletor nativo, sem valor até escolher), Passagem
 * (chips, só quando a linha passa 2 ou mais vezes no ponto, D-121) e Tipos de dia (chips, seleção múltipla). O plano é
 * calculado ao vivo em `data/declareView.ts`; a folha só mostra o que ele devolve. Salvar grava (`useDeclaredTimes`),
 * mostra o toast com Desfazer e fecha; recusa mostra o toast de erro e deixa a folha aberta.
 *
 * Quadro D-150 (como a `VerifySheet` e a `PlaceSheet`): lista numa `View` de altura fixa e rodapé fixo com o Salvar.
 * Sem componente novo: `Chip`, `LineBadge`, o `DateTimePicker` em modo hora como o `RecordSheet` e o botão das outras folhas.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { DayTypeCode } from "@notebus/domain";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDeclaredTimes } from "../data/DeclaredTimesProvider";
import { useNow } from "../data/NowProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { useToast } from "../data/ToastProvider";
import { type DeclareDraft, buildDeclareView, declareToast } from "../data/declareView";
import { stopNameFor } from "../data/stopHeader";
import { createSubmitGuard } from "../data/submitGuard";
import { hhmm } from "../data/testClockPicker";
import { type MessageKey, t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { placeFooterHeight, placeSheetFrame } from "./placeFrame";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function DeclareHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: DeclareHandle };

const DAY_TYPES: { code: DayTypeCode; labelKey: MessageKey }[] = [
  { code: "weekday", labelKey: "settings.day.weekday" },
  { code: "saturday", labelKey: "settings.day.saturday" },
  { code: "sunday_holiday", labelKey: "settings.day.sunday_holiday" },
];

export function DeclareSheet({ id, stopId }: { id: number; stopId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const schedule = useSchedule();
  const declared = useDeclaredTimes();
  const now = useNow();
  const toast = useToast();
  const stopIndex = useStopIndex();

  const [handleHeight, setHandleHeight] = useState(0);
  const [lineCode, setLineCode] = useState<string | null>(null);
  const [hour, setHour] = useState<DeclareDraft["hour"]>(null);
  const [passage, setPassage] = useState<string | null>(null);
  const [dayTypes, setDayTypes] = useState<DayTypeCode[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(() => new Date(now()));
  const submitGuard = useRef(createSubmitGuard()).current;

  const data = schedule.status === "ready" ? schedule.data : null;
  // Nome pelo índice da busca (recarregado a cada edição do ponto); o do snapshot dos horários é a reserva (E-08 bloco 5, item 1).
  const stopName = stopNameFor(stopIndex, stopId, data?.stopNames.get(stopId) ?? "");
  const view = useMemo(
    () => (data ? buildDeclareView(stopId, data, { lineCode, hour, passage, dayTypes }) : null),
    [data, stopId, lineCode, hour, passage, dayTypes],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]?.scrollAreaHeight ?? 0,
    ),
  );
  // O rodapé tem o botão e, quando há, o texto de apoio embaixo dele: a altura vem da medida.
  const [measuredFooter, setMeasuredFooter] = useState(0);
  const footerHeight = measuredFooter > 0 ? measuredFooter : placeFooterHeight({ minTouch, space, bottomInset: insets.bottom });
  const { listHeight } = placeSheetFrame({ scrollAreaHeight, footerHeight });

  const openPicker = () => {
    const base = new Date(now());
    if (hour) base.setHours(hour.hour, hour.minute, 0, 0);
    setPickerDate(base);
    setShowPicker(true);
  };

  const toggleDayType = (code: DayTypeCode) =>
    setDayTypes((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));

  const handleSave = async () => {
    const plan = view?.plan;
    if (!plan) return;
    await submitGuard.run(async () => {
      const result = await declared.declare(plan, now());
      if (result.ok) {
        toast.show({
          title: declareToast(result.steps),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              const undone = await result.undo(now());
              if (!undone.ok) toast.show({ title: t("declare.error.stale"), kind: "error", haptic: "error" });
            },
          },
        });
        close();
      } else {
        toast.show({
          title: result.reason === "stale" ? t("declare.error.stale") : t("declare.error.generic"),
          kind: "error",
          haptic: "error",
        });
      }
    });
  };

  const timeText = hour ? hhmm(hour.hour * 60 + hour.minute) : null;
  const canSave = view?.canSave === true;

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <View collapsable={false} style={{ height: listHeight, overflow: "hidden" }}>
            <BottomSheetScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {t("declare.title")}
                </Text>
                <Text style={[type.bodyStrong, { color: colors.textSecondary }]}>{stopName}</Text>
              </View>

              {view ? (
                <>
                  {/* Linha */}
                  <View style={styles.section}>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>{t("declare.line")}</Text>
                    {view.lines.length === 1 ? (
                      <View style={styles.readRow}>
                        <LineBadge code={view.lines[0]!.code} color={view.lines[0]!.color} />
                      </View>
                    ) : (
                      <View style={styles.chipsRow}>
                        {view.lines.map((line) => (
                          <Chip
                            key={line.code}
                            tone="ring"
                            selected={view.lineCode === line.code}
                            accessibilityLabel={t("declare.line.option.a11y", { line: line.code })}
                            onPress={() => {
                              setLineCode(line.code);
                              setPassage(null);
                            }}
                          >
                            <LineBadge code={line.code} color={line.color} />
                          </Chip>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Hora */}
                  <View style={styles.section}>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>{t("declare.time")}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={timeText ? t("declare.time.a11y", { time: timeText }) : t("declare.time.a11y_empty")}
                      onPress={openPicker}
                      style={({ pressed }) => [styles.pickerRow, { backgroundColor: colors.fill, borderColor: colors.divider }, pressed && styles.pressed]}
                    >
                      <Text
                        style={[timeText ? type.timeMd : type.body, styles.num, { color: timeText ? colors.text : colors.textSecondary }]}
                      >
                        {timeText ?? t("declare.time.placeholder")}
                      </Text>
                    </Pressable>
                    {view.showNightHint ? (
                      <Text style={[type.caption, { color: colors.textSecondary }]}>{t("declare.night_hint")}</Text>
                    ) : null}
                  </View>

                  {/* Passagem: só quando a linha passa mais de uma vez no ponto */}
                  {view.showPassage ? (
                    <View style={styles.section}>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>{t("declare.passage")}</Text>
                      <View style={styles.chipsRow}>
                        {view.passageOptions.map((option) => (
                          <Chip
                            key={option.key}
                            tone="ring"
                            label={option.label}
                            selected={passage === option.key}
                            accessibilityLabel={t("declare.passage.option.a11y", { label: option.label })}
                            onPress={() => setPassage(option.key)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Tipos de dia */}
                  <View style={styles.section}>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>{t("declare.day_types")}</Text>
                    <View style={styles.chipsRow}>
                      {DAY_TYPES.map((day) => (
                        <Chip
                          key={day.code}
                          label={t(day.labelKey)}
                          selected={dayTypes.includes(day.code)}
                          accessibilityLabel={t("declare.day_type.a11y", { day: t(day.labelKey) })}
                          onPress={() => toggleDayType(day.code)}
                        />
                      ))}
                    </View>
                  </View>
                </>
              ) : null}
            </BottomSheetScrollView>
          </View>

          {/* Rodapé fixo com o Salvar */}
          <View
            collapsable={false}
            onLayout={(e) => setMeasuredFooter(Math.round(e.nativeEvent.layout.height))}
            style={[styles.footer, { borderTopColor: colors.divider, paddingBottom: insets.bottom + space.md }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.save")}
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.accent },
                !canSave && styles.disabled,
                pressed && canSave && styles.pressed,
              ]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("common.save")}</Text>
            </Pressable>
            {view?.showPartialHint ? (
              <Text style={[type.caption, styles.partialHint, { color: colors.textSecondary }]}>{t("declare.partial_hint")}</Text>
            ) : null}
          </View>
        </View>

        {/* Seletor de hora nativo */}
        {showPicker &&
          (Platform.OS === "ios" ? (
            <Modal transparent animationType="fade" visible={showPicker} onRequestClose={() => setShowPicker(false)}>
              <Pressable style={[styles.modalOverlay, { backgroundColor: colors.scrim }]} onPress={() => setShowPicker(false)}>
                <Pressable style={[styles.modalBox, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="time"
                    is24Hour
                    display="spinner"
                    textColor={colors.text}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      if (date) setPickerDate(date);
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("alarm.repeat.done")}
                    onPress={() => {
                      setHour({ hour: pickerDate.getHours(), minute: pickerDate.getMinutes() });
                      setShowPicker(false);
                    }}
                    style={[styles.modalDoneButton, { backgroundColor: colors.fill }]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.text }]}>{t("alarm.repeat.done")}</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          ) : (
            <DateTimePicker
              value={pickerDate}
              mode="time"
              is24Hour
              display="default"
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                setShowPicker(false);
                if (event.type === "set" && date) setHour({ hour: date.getHours(), minute: date.getMinutes() });
              }}
            />
          ))}
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.lg },
  header: { gap: space.xs, paddingTop: space.xs },
  section: { gap: space.xs },
  readRow: { minHeight: minTouch, flexDirection: "row", alignItems: "center" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  pickerRow: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  num: { fontVariant: ["tabular-nums"] },
  footer: { paddingTop: space.sm, paddingHorizontal: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs },
  saveButton: { minHeight: minTouch, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  partialHint: { textAlign: "center" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: space.md },
  modalBox: { borderRadius: radius.lg, padding: space.md, width: "100%", maxWidth: 360, gap: space.md },
  modalDoneButton: { minHeight: minTouch, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
