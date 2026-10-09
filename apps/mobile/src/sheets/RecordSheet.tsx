/**
 * TL-06 Registro detalhado (4.5 §2; canvas `Registro.dc.html`; plano E-04 §4).
 *
 * Rascunho em memória, commit no useEffect de desmontagem (D-062).
 * Frase do casamento ao vivo a cada alteração (D-061, T-33).
 * Seletor nativo (@react-native-community/datetimepicker, D-056, Q-44).
 * Suporte a edição de embarque ou descida. Sem emoji.
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { lisbonWallClock, previewMatch } from "@notebus/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { ongoingOf } from "../data/editView";
import { matchNetworkOf } from "../data/records";
import {
  applyDelta,
  applyPickedTime,
  applyPrecision,
  applySpread,
  closeCommit,
  dayHint,
  formatDraftTime,
  formatMatchPreview,
  initDraft,
  isPlusOneDisabled,
  pickerValue,
  timeLabelWithDay,
  validateDraft,
} from "../data/recordDraft";
import { recordPreviewFact } from "../data/recordPreviewFact";
import type { ObservationRow } from "../data/registro";
import { dateNumbers, hhmm, weekdayName } from "../data/testClockPicker";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CheckGlyph, CrossGlyph, InfoGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function RecordHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

/** Canvas: a folha tem 806 px num iPhone de 844 (≈ 95%). */
const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RecordHandle };

const EXACT_CHIPS = [-10, -5, -2, -1, 1] as const;
const RANGE_CHIPS = [2, 5, 10] as const;

export function RecordSheet({ id, observationId }: { id: number; observationId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const schedule = useSchedule();
  const registro = useRegistro();
  const instant = useNowTick();
  const close = useCloseSheet();
  const { dispatch } = useSheets();

  const row = useMemo(
    () => registro.observations.find((o) => o.id === observationId) ?? null,
    [registro.observations, observationId],
  );

  // Se a linha não existe, fecha a folha
  useEffect(() => {
    if (registro.status === "ready" && !row) {
      close();
    }
  }, [registro.status, row, close]);

  if (!row) return null;

  return (
    <RecordSheetLoaded
      id={id}
      initialRow={row}
      schedule={schedule}
      registro={registro}
      instant={instant}
      close={close}
      dispatch={dispatch}
      insets={insets}
      colors={colors}
    />
  );
}

function RecordSheetLoaded({
  id,
  initialRow,
  schedule,
  registro,
  instant,
  close,
  dispatch,
  insets,
  colors,
}: {
  id: number;
  initialRow: ObservationRow;
  schedule: ReturnType<typeof useSchedule>;
  registro: ReturnType<typeof useRegistro>;
  instant: number;
  close: () => void;
  dispatch: ReturnType<typeof useSheets>["dispatch"];
  insets: ReturnType<typeof useSafeAreaInsets>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const window = useWindowDimensions();
  const [handleHeight, setHandleHeight] = useState(0);
  const [draft, setDraft] = useState(() => initDraft(initialRow));
  const [showPicker, setShowPicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<React.ElementRef<typeof BottomSheetScrollView>>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleNoteFocus = useCallback(() => {
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, []);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isDeletedRef = useRef(false);
  const rowRef = useRef(initialRow);
  rowRef.current = initialRow;

  const registroRef = useRef(registro);
  registroRef.current = registro;

  // Fechar grava (D-062): commit no useEffect de desmontagem via ref
  useEffect(() => {
    return () => {
      const patch = closeCommit(draftRef.current, rowRef.current, isDeletedRef.current);
      if (patch) {
        void registroRef.current.edit(rowRef.current.id, patch);
      }
    };
  }, []);

  // Busca dados associados (linha, ponto, descida/embarque par)
  const scheduleData = schedule.status === "ready" ? schedule.data : null;
  const lineInfo = scheduleData?.lineInfo.get(initialRow.lineId);
  const lineCode = lineInfo?.code ?? initialRow.lineId;
  const lineColor = lineInfo?.color ?? colors.text;
  const stopName = scheduleData?.stopNames.get(initialRow.stopId) ?? initialRow.stopId;

  // Viagem associada (para descida quando for embarque, ou embarque quando for descida)
  const ride = useMemo(() => {
    if (initialRow.kind === "boarded") {
      return registro.rides.find((r) => r.boardingObservationId === initialRow.id) ?? null;
    }
    if (initialRow.kind === "alighted") {
      return registro.rides.find((r) => r.alightingObservationId === initialRow.id) ?? null;
    }
    return null;
  }, [initialRow, registro.rides]);

  const pairedAlightRow = useMemo(() => {
    if (initialRow.kind !== "boarded" || !ride?.alightingObservationId) return null;
    return registro.observations.find((o) => o.id === ride.alightingObservationId) ?? null;
  }, [initialRow, ride, registro.observations]);

  const pairedBoardingRow = useMemo(() => {
    if (initialRow.kind !== "alighted" || !ride?.boardingObservationId) return null;
    return registro.observations.find((o) => o.id === ride.boardingObservationId) ?? null;
  }, [initialRow, ride, registro.observations]);

  const pairedAlightStopName = pairedAlightRow && scheduleData
    ? (scheduleData.stopNames.get(pairedAlightRow.stopId) ?? pairedAlightRow.stopId)
    : null;

  // Casamento ao vivo (D-061)
  const preview = useMemo(() => {
    if (!scheduleData) return null;
    const network = matchNetworkOf(scheduleData);
    const draftFact = recordPreviewFact(draft, initialRow);
    const ongoing = ongoingOf(initialRow, registro.rides, registro.observations);
    return previewMatch(draftFact, network, ongoing);
  }, [scheduleData, draft, initialRow, registro.rides, registro.observations]);

  const matchPhrase = useMemo(() => {
    if (!preview) return null;
    return formatMatchPreview(preview, draft, lineCode);
  }, [preview, draft, lineCode]);

  // Validação prévia
  const warningText = useMemo(() => {
    return validateDraft(draft, initialRow, {
      now: instant,
      alightRow: pairedAlightRow,
      boardingRow: pairedBoardingRow,
    });
  }, [draft, initialRow, instant, pairedAlightRow, pairedBoardingRow]);

  // Formatação do Dia e dica de ontem (Q-94 = A)
  const wall = lisbonWallClock(draft.centerMs);
  const nowWall = lisbonWallClock(instant);
  const { text: timeLabel, yesterday: isYesterday } = timeLabelWithDay(draft, instant);
  const dayText =
    wall.date === nowWall.date
      ? t("sheet_record.day.today", {
          weekday: weekdayName(wall.date),
          date: `${wall.date.slice(8, 10)}/${wall.date.slice(5, 7)}`,
        })
      : t("sheet_record.day.other", {
          weekday: weekdayName(wall.date),
          date: `${wall.date.slice(8, 10)}/${wall.date.slice(5, 7)}`,
        });

  const handleDelete = useCallback(async () => {
    isDeletedRef.current = true;
    try {
      await registro.remove(initialRow.id);
      close();
    } catch {
      isDeletedRef.current = false;
      /* o provider já mostrou o toast de falha com "Tentar de novo" */
    }
  }, [close, registro, initialRow.id]);

  const plusOneDisabled = isPlusOneDisabled(draft, instant);

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + space.lg + keyboardHeight },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cabeçalho */}
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("sheet_record.title")}
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
          {/* Card Resumo (Linha, Ponto, Dia, Descida) */}
          <View style={[styles.summaryCard, { backgroundColor: colors.fill }]}>
            {/* Linha */}
            <View style={[styles.summaryRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                {t("sheet_record.field.line")}
              </Text>
              <LineBadge code={lineCode} color={lineColor} />
            </View>

            {/* Ponto */}
            <View style={[styles.summaryRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                {t("sheet_record.field.stop")}
              </Text>
              <Text numberOfLines={1} style={[type.bodyStrong, styles.summaryValue, { color: colors.text }]}>
                {stopName}
              </Text>
            </View>

            {/* Dia */}
            <View
              style={[
                styles.summaryRow,
                initialRow.kind === "boarded" ? { borderBottomColor: colors.divider } : null,
                isYesterday ? [styles.summaryRowHighlighted, { backgroundColor: colors.highlight }] : null,
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  { color: isYesterday ? colors.accent : colors.textSecondary },
                ]}
              >
                {t("sheet_record.field.day")}
              </Text>
              <Text
                style={[
                  type.bodyStrong,
                  styles.summaryValue,
                  styles.num,
                  { color: isYesterday ? colors.accent : colors.text },
                ]}
              >
                {dayText}
              </Text>
            </View>

            {/* Descida (apenas se for embarque) */}
            {initialRow.kind === "boarded" && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {t("sheet_record.field.alight")}
                </Text>
                {pairedAlightRow ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      dispatch({ type: "push", sheet: { kind: "record", observationId: pairedAlightRow.id } });
                    }}
                    style={styles.alightLink}
                  >
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.accent, flex: 1 }]}>
                      {pairedAlightStopName} · {hhmm(lisbonWallClock(pairedAlightRow.observedAt).minute)}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>→</Text>
                  </Pressable>
                ) : (
                  <Text style={[type.body, { color: colors.textSecondary }]}>
                    {t("sheet_record.alight.none")}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tipo de Registro (Embarquei / Só vi passar) - apenas para não-descida */}
          {initialRow.kind !== "alighted" && (
            <View role="radiogroup" aria-label="O que aconteceu" style={styles.kindGroup}>
              <Pressable
                role="radio"
                aria-checked={draft.kind === "boarded"}
                accessibilityRole="button"
                onPress={() => setDraft((curr) => ({ ...curr, kind: "boarded" }))}
                style={[
                  styles.kindButton,
                  draft.kind === "boarded"
                    ? { backgroundColor: colors.accent }
                    : { backgroundColor: colors.fill },
                ]}
              >
                <Text
                  style={[
                    type.bodyStrong,
                    { color: draft.kind === "boarded" ? colors.onAccent : colors.text },
                  ]}
                >
                  {t("sheet_record.kind.boarded")}
                </Text>
              </Pressable>

              <Pressable
                role="radio"
                aria-checked={draft.kind === "passed"}
                accessibilityRole="button"
                onPress={() => setDraft((curr) => ({ ...curr, kind: "passed" }))}
                style={[
                  styles.kindButton,
                  draft.kind === "passed"
                    ? { backgroundColor: colors.accent }
                    : { backgroundColor: colors.fill },
                ]}
              >
                <Text
                  style={[
                    type.bodyStrong,
                    { color: draft.kind === "passed" ? colors.onAccent : colors.text },
                  ]}
                >
                  {t("sheet_record.kind.passed")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Seção Hora */}
          <View style={styles.timeSection}>
            <View style={styles.timeHeader}>
              <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                {t("sheet_record.time")}
              </Text>
              <View role="radiogroup" aria-label="Precisão da hora" style={[styles.modeToggle, { backgroundColor: colors.fill }]}>
                <Pressable
                  role="radio"
                  aria-checked={draft.precision === "exact"}
                  onPress={() => setDraft((curr) => applyPrecision(curr, "exact"))}
                  style={[
                    styles.modeButton,
                    draft.precision === "exact" ? { backgroundColor: colors.surface } : null,
                  ]}
                >
                  <Text
                    style={[
                      type.caption,
                      {
                        color: colors.text,
                        fontWeight: draft.precision === "exact" ? "600" : "500",
                      },
                    ]}
                  >
                    {t("sheet_record.time.exact")}
                  </Text>
                </Pressable>
                <Pressable
                  role="radio"
                  aria-checked={draft.precision === "range"}
                  onPress={() => setDraft((curr) => applyPrecision(curr, "range"))}
                  style={[
                    styles.modeButton,
                    draft.precision === "range" ? { backgroundColor: colors.surface } : null,
                  ]}
                >
                  <Text
                    style={[
                      type.caption,
                      {
                        color: colors.text,
                        fontWeight: draft.precision === "range" ? "600" : "500",
                      },
                    ]}
                  >
                    {t("sheet_record.time.range")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Display do Horário Central (abre DateTimePicker ao toque) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("sheet_record.time.aria", { time: timeLabel })}
              onPress={() => setShowPicker(true)}
              style={[styles.timeDisplay, { backgroundColor: colors.fill }]}
            >
              <View style={styles.timeDisplayInner}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[type.timeLg, styles.num, { color: colors.text, fontSize: 32 }]}
                >
                  {timeLabel}
                </Text>
              </View>
            </Pressable>

            {/* Chips de Ajuste */}
            {draft.precision === "exact" ? (
              <View style={styles.chipsRow}>
                {EXACT_CHIPS.map((delta) => {
                  const isDisabled = delta === 1 && plusOneDisabled;
                  const label = `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
                  const a11y =
                    delta > 0
                      ? t("sheet_record.adjust.after.aria", { count: 1 })
                      : t("sheet_record.adjust.before.aria", { count: Math.abs(delta) });
                  return (
                    <Pressable
                      key={delta}
                      accessibilityRole="button"
                      accessibilityLabel={a11y}
                      disabled={isDisabled}
                      onPress={() => setDraft((curr) => applyDelta(curr, delta, instant))}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: colors.fill },
                        isDisabled && { opacity: 0.35 },
                        pressed && !isDisabled && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.chipsRow}>
                {RANGE_CHIPS.map((spread) => {
                  const isSelected = draft.spreadMinutes === spread;
                  return (
                    <Pressable
                      key={spread}
                      accessibilityRole="button"
                      onPress={() => setDraft((curr) => applySpread(curr, spread))}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.accent : colors.fill,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[
                          type.bodyStrong,
                          styles.num,
                          { color: isSelected ? colors.onAccent : colors.text },
                        ]}
                      >
                        {t("sheet_record.range.chip", { minutes: spread })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Frase do Casamento ao Vivo (D-061) */}
            {matchPhrase && (
              <View role="status" aria-live="polite" style={styles.matchPhraseContainer}>
                <View style={styles.matchIconWrapper}>
                  {matchPhrase.kind === "auto" ? (
                    <CheckGlyph color={colors.textSecondary} />
                  ) : (
                    <InfoGlyph color={colors.textSecondary} />
                  )}
                </View>
                <Text style={[type.caption, styles.num, styles.matchText, { color: colors.text }]}>
                  {matchPhrase.text}
                </Text>
              </View>
            )}
          </View>

          {/* Switch Anotei de Memória */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: draft.memory }}
            onPress={() => setDraft((curr) => ({ ...curr, memory: !curr.memory }))}
            style={styles.switchRow}
          >
            <View style={styles.switchLabels}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("sheet_record.memory")}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("sheet_record.memory.detail")}
              </Text>
            </View>
            <View
              style={[
                styles.switchTrack,
                { backgroundColor: draft.memory ? colors.accent : colors.divider },
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  {
                    backgroundColor: colors.surface,
                    transform: [{ translateX: draft.memory ? 20 : 0 }],
                  },
                ]}
              />
            </View>
          </Pressable>

          {/* Campo de Nota */}
          <View style={styles.noteSection}>
            <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
              {t("sheet_record.note")}
            </Text>
            <BottomSheetTextInput
              value={draft.note}
              onChangeText={(text) => setDraft((curr) => ({ ...curr, note: text }))}
              placeholder={t("sheet_record.note.placeholder")}
              placeholderTextColor={colors.textSecondary}
              style={[styles.noteInput, { backgroundColor: colors.fill, color: colors.text }]}
              onFocus={handleNoteFocus}
            />
          </View>

          {/* Aviso / Problema prévio (se houver) */}
          {warningText && (
            <View style={[styles.warningBox, { backgroundColor: colors.highlight }]}>
              <Text style={[type.caption, { color: colors.danger, fontWeight: "600" }]}>
                {warningText}
              </Text>
            </View>
          )}

          {/* Botão Apagar Registro */}
          <Pressable
            accessibilityRole="button"
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.danger }]}>
              {t("sheet_record.delete")}
            </Text>
          </Pressable>
        </BottomSheetScrollView>
        </View>

        {/* DateTimePicker Nativo */}
        {showPicker && (
          Platform.OS === "ios" ? (
            <Modal
              transparent
              animationType="fade"
              visible={showPicker}
              onRequestClose={() => setShowPicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
                <Pressable
                  style={[styles.modalBox, { backgroundColor: colors.surface }]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <DateTimePicker
                    value={pickerValue(draft.centerMs)}
                    mode="time"
                    is24Hour={true}
                    display="spinner"
                    textColor={colors.text}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      if (date) {
                        const h = date.getHours();
                        const m = date.getMinutes();
                        setDraft((curr) => applyPickedTime(curr, h, m, instant));
                      }
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowPicker(false)}
                    style={[styles.modalDoneButton, { backgroundColor: colors.fill }]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.text }]}>OK</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          ) : (
            <DateTimePicker
              value={pickerValue(draft.centerMs)}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                setShowPicker(false);
                if (event.type === "set" && date) {
                  const h = date.getHours();
                  const m = date.getMinutes();
                  setDraft((curr) => applyPickedTime(curr, h, m, instant));
                }
              }}
            />
          )
        )}
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
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
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  summaryCard: {
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    gap: space.sm,
  },
  summaryLabel: {
    width: 56,
    fontSize: 15,
  },
  summaryValue: {
    flex: 1,
  },
  alightLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  kindGroup: {
    flexDirection: "row",
    gap: space.sm,
  },
  kindButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  timeSection: {
    gap: space.sm,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeToggle: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: 2,
  },
  modeButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm - 2,
  },
  timeDisplay: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  timeDisplayInner: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
  },
  summaryRowHighlighted: {
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  chipsRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  matchPhraseContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
    paddingVertical: 2,
  },
  matchIconWrapper: {
    marginTop: 2,
  },
  matchText: {
    flex: 1,
    lineHeight: 18,
  },
  infoMark: {
    fontSize: 14,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: minTouch,
    gap: space.sm,
  },
  switchLabels: {
    flex: 1,
    gap: 2,
  },
  switchTrack: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
  },
  noteSection: {
    gap: 6,
  },
  noteInput: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    fontSize: 16,
  },
  warningBox: {
    borderRadius: radius.sm,
    padding: space.sm,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    gap: space.xs,
    marginTop: space.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  modalBox: {
    width: "100%",
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: "center",
    gap: space.md,
  },
  modalDoneButton: {
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  num: {
    fontVariant: ["tabular-nums"],
  },
});
