/**
 * TL-11/E-08 Bloco 11: Criação de linha (Item 1; D-150, RNF-06, 4.4 §5.12).
 *
 * Moldura no quadro da StopEditSheet (D-150, rolagem e teclado com useKeyboardHeight).
 * Seções:
 * 1. Código e Nome (máximos LINE_LIMITS, contadores, mensagens de erro).
 * 2. Cor (LINE_COLORS selecionáveis com alvo minTouch, LineBadge ao vivo).
 * 3. Percurso (Nome do percurso, Circular, paragens com alça de arrastar e Remover, + Adicionar paragem).
 * 4. Duração (minutos, texto de apoio).
 * 5. Dias (Chips: dia útil, sábado, domingo e feriado).
 * 6. Saídas (Chips de modo: Horários avulsos ou Frequência; apoio da madrugada).
 * 7. Rodapé fixo: Criar linha (desligado se canSave falso).
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { useScheduleReload } from "../data/ScheduleProvider";
import { useReloadStopIndex } from "../data/StopIndexProvider";
import { useToast } from "../data/ToastProvider";
import {
  LINE_COLORS,
  addDeparture,
  addStop,
  applyPickedTime,
  initialLineFormState,
  lineFormView,
  pickerInitialMinute,
  removeDeparture,
  removeStop,
  setMode,
  submitLineForm,
  toggleDayType,
  type LineFormMode,
  type LineFormState,
  type LineFormStopRow,
} from "../data/lineForm";
import { dragTargetIndex, moveStopTo, stopActionTarget } from "../data/lineStopReorder";
import { LINE_LIMITS } from "../data/lineDraft";
import { createSubmitGuard } from "../data/submitGuard";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import type { MessageKey } from "../i18n/pt-BR";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { CrossGlyph, DragHandleGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { PickerModal } from "../ui/PickerModal";
import { SheetHandle } from "./SheetHandle";
import { useSheets, useStopPick } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { placeFooterHeight, placeSheetFrame } from "./placeFrame";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { useKeyboardHeight } from "./useKeyboardHeight";
import type { DayTypeCode } from "@notebus/domain";

const HeightContext = createContext<(height: number) => void>(() => {});

function LineEditHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: LineEditHandle };

const COLOR_NAMES: Record<string, MessageKey> = {
  "#5B4BD6": "line_create.color.purple",
  "#1E3A8A": "line_create.color.blue",
  "#2E7D32": "line_create.color.green",
  "#F57C00": "line_create.color.orange",
  "#D32F2F": "line_create.color.red",
  "#C7017F": "line_create.color.pink",
  "#7CB342": "line_create.color.lime",
  "#00838F": "line_create.color.cyan",
};

const DAY_TYPES: { code: DayTypeCode; labelKey: MessageKey }[] = [
  { code: "weekday", labelKey: "settings.day.weekday" },
  { code: "saturday", labelKey: "settings.day.saturday" },
  { code: "sunday_holiday", labelKey: "settings.day.sunday_holiday" },
];

interface StopOrderRowProps {
  row: LineFormStopRow;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function StopOrderRow({ row, total, onMove, onRemove }: StopOrderRowProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const itemHeight = useSharedValue(56);

  const onDrop = (translationY: number, rowHeight: number) => {
    const target = dragTargetIndex({ index: row.index, translationY, rowHeight, total });
    if (target !== row.index) {
      onMove(row.index, target);
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(onDrop)(event.translationY, itemHeight.value);
    })
    .onFinalize(() => {
      translateY.value = withSpring(0);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: isDragging.value ? 1.02 : 1 },
    ],
    zIndex: isDragging.value ? 999 : 1,
    elevation: isDragging.value ? 8 : 0,
    shadowColor: "#000",
    shadowOpacity: isDragging.value ? 0.2 : 0,
    shadowRadius: isDragging.value ? 6 : 0,
    shadowOffset: { width: 0, height: 3 },
  }));

  const labelText = `${row.index + 1}. ${row.name}`;

  return (
    <Animated.View
      style={animatedStyle}
      onLayout={(e) => {
        itemHeight.value = e.nativeEvent.layout.height + space.xs;
      }}
    >
      <View style={[styles.stopRow, { backgroundColor: colors.fill }]}>
        <GestureDetector gesture={pan}>
          <View
            style={styles.dragHandleHitTarget}
            accessibilityElementsHidden={true}
            importantForAccessibility="no"
          >
            <DragHandleGlyph color={colors.textSecondary} />
          </View>
        </GestureDetector>

        <View
          accessible
          accessibilityLabel={labelText}
          accessibilityActions={row.actions.map((a) => ({ name: a.name, label: t(a.labelKey) }))}
          onAccessibilityAction={(event) => {
            const target = stopActionTarget(event.nativeEvent.actionName, row.index);
            if (target !== null) {
              onMove(row.index, target);
            }
          }}
          style={styles.stopNameContainer}
        >
          <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
            {labelText}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("line_create.stop.remove")}
          onPress={() => onRemove(row.index)}
          style={styles.smallAction}
        >
          <Text style={[type.caption, { color: colors.danger }]}>
            {t("line_create.stop.remove")}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function LineEditSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const now = useNow();
  const toast = useToast();
  const reloadStopIndex = useReloadStopIndex();
  const reloadSchedule = useScheduleReload();
  const stopPick = useStopPick();
  const { dispatch } = useSheets();
  const db = getSharedDb();
  const keyboard = useKeyboardHeight();

  const [handleHeight, setHandleHeight] = useState(0);
  const [state, setState] = useState<LineFormState>(initialLineFormState);
  const [saveError, setSaveError] = useState<string | null>(null);

  type PickerTarget = "departure" | "freqFrom" | "freqTo";
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(() => new Date(now()));

  const view = useMemo(() => lineFormView(state), [state]);
  const submitGuard = useRef(createSubmitGuard()).current;

  const moveStopRow = (from: number, to: number) =>
    setState((prev) => ({ ...prev, stops: moveStopTo(prev.stops, from, to) }));

  const openTimePicker = (target: PickerTarget) => {
    const base = new Date(now());
    const initialMinute = pickerInitialMinute(state, target);
    base.setHours(Math.floor(initialMinute / 60), initialMinute % 60, 0, 0);
    setPickerDate(base);
    setPickerTarget(target);
  };

  const commitPickerTime = (date: Date) => {
    if (!pickerTarget) return;
    const hour = date.getHours();
    const minute = date.getMinutes();
    setState((prev) => applyPickedTime(prev, pickerTarget, hour, minute));
    setPickerTarget(null);
  };

  const handleAddStop = () => {
    stopPick.request((stop) => {
      setState((prev) => ({ ...prev, stops: addStop(prev.stops, stop) }));
    });
    dispatch({ type: "push", sheet: { kind: "search", pick: true } });
  };

  const handleCreate = async () => {
    if (!view.canSave) return;
    await submitGuard.run(async () => {
      if (!db) return;
      const outcome = await submitLineForm(db, state, now());
      if (outcome.kind === "created") {
        await reloadStopIndex();
        await reloadSchedule();
        close();
        toast.show({
          title: t("line_create.toast.created"),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              const undone = await outcome.undo(now());
              await reloadStopIndex();
              await reloadSchedule();
              if (!undone.ok) {
                toast.show({
                  title: t("line_create.error.stale"),
                  kind: "error",
                  haptic: "error",
                });
              }
            },
          },
        });
      } else if (outcome.kind === "refused") {
        toast.show({
          title: t(outcome.text.key, outcome.text.params),
          kind: "error",
          haptic: "error",
        });
      }
    });
  };

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const footerHeight = placeFooterHeight({
    minTouch,
    space,
    bottomInset: insets.bottom,
  });

  const { listHeight } = placeSheetFrame({
    scrollAreaHeight,
    footerHeight,
  });

  const formatClock = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <View collapsable={false} style={{ height: listHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: keyboard > 0 ? keyboard + space.xl : space.xl },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {t("line_create.title")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                  onPress={close}
                  style={styles.closeHitTarget}
                >
                  <View style={[styles.closeIconCircle, { backgroundColor: colors.fill }]}>
                    <CrossGlyph color={colors.textSecondary} />
                  </View>
                </Pressable>
              </View>

              {saveError ? (
                <Text style={[type.caption, { color: colors.danger }]}>{saveError}</Text>
              ) : null}

              {/* 1. Código e Nome */}
              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("line_create.code")}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {`${state.code.length}/${LINE_LIMITS.codeMax}`}
                  </Text>
                </View>
                <BottomSheetTextInput
                  value={state.code}
                  maxLength={LINE_LIMITS.codeMax}
                  onChangeText={(val) => {
                    setState((prev) => ({ ...prev, code: val }));
                    setSaveError(null);
                  }}
                  placeholder={t("line_create.code")}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    type.body,
                    styles.textInput,
                    { backgroundColor: colors.fill, color: colors.text },
                  ]}
                />
              </View>

              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("line_create.name")}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {`${state.name.length}/${LINE_LIMITS.nameMax}`}
                  </Text>
                </View>
                <BottomSheetTextInput
                  value={state.name}
                  maxLength={LINE_LIMITS.nameMax}
                  onChangeText={(val) => {
                    setState((prev) => ({ ...prev, name: val }));
                    setSaveError(null);
                  }}
                  placeholder={t("line_create.name")}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    type.body,
                    styles.textInput,
                    { backgroundColor: colors.fill, color: colors.text },
                  ]}
                />
              </View>

              {/* 2. Cor */}
              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("line_create.color")}
                  </Text>
                  <LineBadge code={state.code.trim() || "?"} color={state.color} />
                </View>
                <View style={styles.colorsRow}>
                  {LINE_COLORS.map((c) => {
                    const isSelected = state.color === c;
                    const colorName = t(COLOR_NAMES[c] ?? "line_create.color.purple");
                    const a11yLabel = t(
                      isSelected ? "line_create.color.selected_a11y" : "line_create.color.a11y",
                      { color: colorName },
                    );
                    return (
                      <Pressable
                        key={c}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={a11yLabel}
                        onPress={() => setState((prev) => ({ ...prev, color: c }))}
                        style={styles.colorHitTarget}
                      >
                        <View
                          style={[
                            styles.colorCircle,
                            { backgroundColor: c },
                            isSelected && {
                              borderColor: colors.text,
                              borderWidth: 3,
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 3. Percurso */}
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("line_create.pattern")}
                </Text>
                <View style={styles.labelRow}>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("line_create.pattern_label")}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {`${state.patternLabel.length}/${LINE_LIMITS.patternLabelMax}`}
                  </Text>
                </View>
                <BottomSheetTextInput
                  value={state.patternLabel}
                  maxLength={LINE_LIMITS.patternLabelMax}
                  onChangeText={(val) => setState((prev) => ({ ...prev, patternLabel: val }))}
                  placeholder={t("line_create.pattern_label")}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    type.body,
                    styles.textInput,
                    { backgroundColor: colors.fill, color: colors.text },
                  ]}
                />

                <View style={styles.switchRow}>
                  <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                    {t("line_create.circular")}
                  </Text>
                  <Switch
                    accessibilityLabel={t("line_create.circular")}
                    value={state.isCircular}
                    onValueChange={(val) => setState((prev) => ({ ...prev, isCircular: val }))}
                    trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                    thumbColor={colors.surface}
                  />
                </View>

                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600", marginTop: space.sm }]}>
                  {t("line_create.stops")}
                </Text>

                <View style={styles.stopsList}>
                  {view.stopRows.map((row) => (
                    <StopOrderRow
                      key={`${row.id}-${row.index}`}
                      row={row}
                      total={view.stopRows.length}
                      onMove={moveStopRow}
                      onRemove={(index) =>
                        setState((prev) => ({ ...prev, stops: removeStop(prev.stops, index) }))
                      }
                    />
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("line_create.stop.add")}
                  onPress={handleAddStop}
                  style={[styles.addStopButton, { backgroundColor: colors.fill }]}
                >
                  <Text style={[type.bodyStrong, { color: colors.accent }]}>
                    {`+ ${t("line_create.stop.add")}`}
                  </Text>
                </Pressable>
              </View>

              {/* 4. Duração */}
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("line_create.duration")}
                </Text>
                <BottomSheetTextInput
                  value={state.durationText}
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(val) => setState((prev) => ({ ...prev, durationText: val }))}
                  placeholder={t("line_create.duration")}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    type.body,
                    styles.textInput,
                    { backgroundColor: colors.fill, color: colors.text },
                  ]}
                />
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t(view.durationHelperKey)}
                </Text>
              </View>

              {/* 5. Dias */}
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("line_create.days")}
                </Text>
                <View style={styles.chipsRow}>
                  {DAY_TYPES.map(({ code, labelKey }) => (
                    <Chip
                      key={code}
                      label={t(labelKey)}
                      selected={state.dayTypeCodes.includes(code)}
                      onPress={() => setState((prev) => toggleDayType(prev, code))}
                    />
                  ))}
                </View>
              </View>

              {/* 6. Saídas */}
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("line_create.departures_section")}
                </Text>
                <View style={styles.chipsRow}>
                  <Chip
                    label={t("line_create.mode.departures")}
                    selected={state.mode === "departures"}
                    onPress={() => setState((prev) => setMode(prev, "departures"))}
                  />
                  <Chip
                    label={t("line_create.mode.frequency")}
                    selected={state.mode === "frequency"}
                    onPress={() => setState((prev) => setMode(prev, "frequency"))}
                  />
                </View>

                {state.mode === "departures" ? (
                  <View style={styles.departuresContainer}>
                    <View style={styles.departuresList}>
                      {state.departures.map((d, index) => (
                        <View key={`${d.hour}:${d.minute}-${index}`} style={[styles.departureRow, { backgroundColor: colors.fill }]}>
                          <Text style={[type.bodyStrong, { color: colors.text }]}>
                            {`${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t("line_create.stop.remove")}
                            onPress={() => setState((prev) => ({ ...prev, departures: removeDeparture(prev.departures, index) }))}
                            style={styles.smallAction}
                          >
                            <Text style={[type.caption, { color: colors.danger }]}>
                              {t("line_create.stop.remove")}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("line_create.departure.add")}
                      onPress={() => openTimePicker("departure")}
                      style={[styles.addStopButton, { backgroundColor: colors.fill }]}
                    >
                      <Text style={[type.bodyStrong, { color: colors.accent }]}>
                        {`+ ${t("line_create.departure.add")}`}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.frequencyContainer}>
                    <View style={styles.frequencyTimesRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t("line_create.departure.from")}: ${formatClock(state.frequency.fromMinute)}`}
                        onPress={() => openTimePicker("freqFrom")}
                        style={[styles.freqTimeBox, { backgroundColor: colors.fill }]}
                      >
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("line_create.departure.from")}
                        </Text>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>
                          {formatClock(state.frequency.fromMinute)}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t("line_create.departure.to")}: ${formatClock(state.frequency.toMinute)}`}
                        onPress={() => openTimePicker("freqTo")}
                        style={[styles.freqTimeBox, { backgroundColor: colors.fill }]}
                      >
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("line_create.departure.to")}
                        </Text>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>
                          {formatClock(state.frequency.toMinute)}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={[styles.stepperRow, { backgroundColor: colors.fill }]}>
                      <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                        {t("line_create.frequency.headway", { n: state.frequency.headwayMinutes })}
                      </Text>
                      <View style={styles.stepperControls}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("settings.margin.less")}
                          disabled={state.frequency.headwayMinutes <= 1}
                          accessibilityState={{ disabled: state.frequency.headwayMinutes <= 1 }}
                          onPress={() =>
                            setState((prev) => ({
                              ...prev,
                              frequency: {
                                ...prev.frequency,
                                headwayMinutes: Math.max(1, prev.frequency.headwayMinutes - 1),
                              },
                            }))
                          }
                          style={[
                            styles.stepperButton,
                            state.frequency.headwayMinutes <= 1 && styles.disabledButton,
                          ]}
                        >
                          <Text style={[type.title, { color: colors.text }]}>−</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("settings.margin.more")}
                          onPress={() =>
                            setState((prev) => ({
                              ...prev,
                              frequency: {
                                ...prev.frequency,
                                headwayMinutes: prev.frequency.headwayMinutes + 1,
                              },
                            }))
                          }
                          style={styles.stepperButton}
                        >
                          <Text style={[type.title, { color: colors.text }]}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}

                {view.showMadrugadaHint ? (
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("line_create.madrugada_hint")}
                  </Text>
                ) : null}
              </View>
            </BottomSheetScrollView>
          </View>

          {/* 7. Rodapé fixo com Criar linha */}
          <View
            style={[
              styles.footer,
              {
                height: footerHeight,
                borderTopColor: colors.divider,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={!view.canSave}
              accessibilityState={{ disabled: !view.canSave }}
              onPress={() => void handleCreate()}
              style={[
                styles.saveButton,
                { backgroundColor: colors.accent, opacity: !view.canSave ? 0.4 : 1 },
              ]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                {t("line_create.button.save")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Seletor de hora nativo */}
        {pickerTarget !== null &&
          (Platform.OS === "ios" ? (
            <PickerModal
              visible={pickerTarget !== null}
              onClose={() => setPickerTarget(null)}
              doneLabel={t("alarm.repeat.done")}
              onDone={() => commitPickerTime(pickerDate)}
            >
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
            </PickerModal>
          ) : (
            <DateTimePicker
              value={pickerDate}
              mode="time"
              is24Hour
              display="default"
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                setPickerTarget(null);
                if (event.type === "set" && date) commitPickerTime(date);
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
    gap: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  closeHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: space.xs,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  textInput: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  colorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  colorHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTouch,
  },
  stopsList: {
    gap: space.xs,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  dragHandleHitTarget: {
    minWidth: 32,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNameContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  smallAction: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.3,
  },
  addStopButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  departuresContainer: {
    gap: space.xs,
  },
  departuresList: {
    gap: space.xs,
  },
  departureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  frequencyContainer: {
    gap: space.sm,
  },
  frequencyTimesRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  freqTimeBox: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    justifyContent: "center",
  },
  stepperRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  stepperButton: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
