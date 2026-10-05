/**
 * TL-09 Conferir registro (4.5 §4; canvas `Conferir.dc.html`; plano E-04 §5).
 *
 * Exibe opções de candidatos para registros órfãos ou ambíguos.
 * Permite escolher uma viagem manual, trocar de linha, dispensar com "Não sei" ou substituir pela TL-06 ("Corrigir a hora").
 * Sem FlatList; segue a moldura da AlightSheet. Sem emoji.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { type VerifyPassage, lisbonWallClock, verifyOptions } from "@notebus/domain";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { factOf } from "../data/rideView";
import { matchNetworkOf } from "../data/records";
import { dateNumbers, hhmm, weekdayName } from "../data/testClockPicker";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, InfoGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function VerifyHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

/** Canvas: a folha tem 688 px num iPhone de 844 (≈ 82%). */
const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: VerifyHandle };

export function VerifySheet({ id, observationId }: { id: number; observationId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const registro = useRegistro();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const [handleHeight, setHandleHeight] = useState(0);
  const busy = useRef(false);

  const row = useMemo(
    () => registro.observations.find((o) => o.id === observationId) ?? null,
    [registro.observations, observationId],
  );

  // Se o registro não existe, fecha a folha
  useEffect(() => {
    if (registro.status === "ready" && !row) {
      close();
    }
  }, [registro.status, row, close]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;
  const network = useMemo(() => (scheduleData ? matchNetworkOf(scheduleData) : null), [scheduleData]);

  // Alight do mesmo ride (se houver)
  const pairedAlight = useMemo(() => {
    if (!row || row.kind !== "boarded") return undefined;
    const ride = registro.rides.find((r) => r.boardingObservationId === row.id);
    if (!ride?.alightingObservationId) return undefined;
    const alightRow = registro.observations.find((o) => o.id === ride.alightingObservationId);
    if (!alightRow) return undefined;
    return {
      tripId: alightRow.tripId,
      matchStatus: alightRow.matchStatus,
      stopId: alightRow.stopId,
      observedAt: alightRow.observedAt,
    };
  }, [row, registro.rides, registro.observations]);

  const ongoingRide = useMemo(() => {
    if (!row) return null;
    return ongoingOf(row, registro.rides, registro.observations);
  }, [row, registro.rides, registro.observations]);

  const options = useMemo(() => {
    if (!row || !network) return null;
    return verifyOptions(factOf(row), network, { ride: ongoingRide, alight: pairedAlight });
  }, [row, network, ongoingRide, pairedAlight]);

  // Se o registro já foi resolvido para auto enquanto a folha estava aberta, fecha calada
  useEffect(() => {
    if (options && options.status === "auto") {
      close();
    }
  }, [options, close]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  if (!row || !options || options.status === "auto") return null;

  const lineInfo = scheduleData?.lineInfo.get(row.lineId);
  const lineCode = lineInfo?.code ?? row.lineId;
  const lineColor = lineInfo?.color ?? colors.text;
  const stopName = scheduleData?.stopNames.get(row.stopId) ?? row.stopId;

  const wall = lisbonWallClock(row.observedAt);
  const kindText =
    row.kind === "boarded"
      ? t("common.kind.boarded.short")
      : row.kind === "passed"
        ? t("common.kind.passed.short")
        : t("common.kind.alighted.short");

  const recordSubtitle = t("sheet_verify.record", {
    weekday: weekdayName(wall.date),
    date: `${wall.date.slice(8, 10)}/${wall.date.slice(5, 7)}`,
    time: hhmm(wall.minute),
    kind: kindText,
  });

  const explanation =
    options.status === "orphan"
      ? t("sheet_verify.orphan", { line: lineCode, time: hhmm(wall.minute) })
      : t("sheet_verify.ambiguous", { line: lineCode, time: hhmm(wall.minute) });

  const primaryCandidates = options.status === "orphan" ? options.sameLine : options.candidates;
  const otherCandidates = options.otherLines;

  const handleChoose = async (candidate: VerifyPassage) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await registro.chooseManual(row.id, {
        tripId: candidate.tripId,
        position: candidate.position,
        serviceDate: candidate.serviceDate,
        lineId: candidate.lineId !== row.lineId ? candidate.lineId : undefined,
      });
      if (res.ok) {
        close();
      } else {
        busy.current = false;
      }
    } catch {
      busy.current = false;
    }
  };

  const handleDismiss = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await registro.dismissReview(row.id);
      close();
    } catch {
      busy.current = false;
    }
  };

  const handleAdjustTime = () => {
    dispatch({ type: "replace", sheet: { kind: "record", observationId: row.id } });
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space.lg }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cabeçalho */}
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("sheet_verify.title")}
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

            {/* Fato Observado (Linha, Ponto, Data/Hora/Tipo) */}
            <View style={[styles.factCard, { backgroundColor: colors.fill }]}>
              <LineBadge code={lineCode} color={lineColor} />
              <View style={styles.factText}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{stopName}</Text>
                <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                  {recordSubtitle}
                </Text>
              </View>
            </View>

            {/* Frase explicativa */}
            <View style={styles.explanationRow}>
              <View style={styles.infoMark}>
                <InfoGlyph color={colors.textSecondary} />
              </View>
              <Text style={[type.body, styles.num, styles.explanationText, { color: colors.text }]}>
                {explanation}
              </Text>
            </View>

            {/* Seção "Qual foi?" */}
            {primaryCandidates.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("sheet_verify.which")}
                </Text>
                <View style={styles.candidateList}>
                  {primaryCandidates.map((c) => {
                    const cLineInfo = scheduleData?.lineInfo.get(c.lineId);
                    const cLineCode = cLineInfo?.code ?? c.lineId;
                    const cLineColor = cLineInfo?.color ?? colors.text;
                    const destName = c.destinationStopId
                      ? (scheduleData?.stopNames.get(c.destinationStopId) ?? c.destinationStopId)
                      : "";
                    const originName = c.originStopId
                      ? (scheduleData?.stopNames.get(c.originStopId) ?? c.originStopId)
                      : "";
                    const hintStopName = c.alightHint
                      ? (scheduleData?.stopNames.get(c.alightHint.stopId) ?? c.alightHint.stopId)
                      : "";

                    const d = Math.round(c.deviation);
                    const devText =
                      d > 0
                        ? t("sheet_verify.trip.late", { time: hhmm(c.base.minute), minutes: d })
                        : d < 0
                          ? t("sheet_verify.trip.early", { time: hhmm(c.base.minute), minutes: Math.abs(d) })
                          : t("sheet_verify.trip.on_time", { time: hhmm(c.base.minute) });

                    const subText = c.alightHint
                      ? t("sheet_verify.ride_hint", {
                          stop_name: hintStopName,
                          time: hhmm(lisbonWallClock(c.alightHint.observedAt).minute),
                        })
                      : t("sheet_verify.trip.detail", {
                          destination: destName,
                          first_stop: originName,
                          time: hhmm(c.departureMinute ?? 0),
                        });

                    return (
                      <Pressable
                        key={`${c.tripId}:${c.position}`}
                        accessibilityRole="button"
                        onPress={() => void handleChoose(c)}
                        style={({ pressed }) => [
                          styles.candidateCard,
                          { borderColor: colors.divider, backgroundColor: colors.surface },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <LineBadge code={cLineCode} color={cLineColor} />
                        <View style={styles.candidateText}>
                          <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                            {devText}
                          </Text>
                          <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                            {subText}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Seção "Ou foi outra linha?" */}
            {otherCandidates.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("sheet_verify.other_line")}
                </Text>
                <View style={styles.candidateList}>
                  {otherCandidates.map((c) => {
                    const cLineInfo = scheduleData?.lineInfo.get(c.lineId);
                    const cLineCode = cLineInfo?.code ?? c.lineId;
                    const cLineColor = cLineInfo?.color ?? colors.text;
                    const destName = c.destinationStopId
                      ? (scheduleData?.stopNames.get(c.destinationStopId) ?? c.destinationStopId)
                      : "";
                    const originName = c.originStopId
                      ? (scheduleData?.stopNames.get(c.originStopId) ?? c.originStopId)
                      : "";

                    const d = Math.round(c.deviation);
                    const devText =
                      d > 0
                        ? t("sheet_verify.trip.late", { time: hhmm(c.base.minute), minutes: d })
                        : d < 0
                          ? t("sheet_verify.trip.early", { time: hhmm(c.base.minute), minutes: Math.abs(d) })
                          : t("sheet_verify.trip.on_time", { time: hhmm(c.base.minute) });

                    const subText = t("sheet_verify.trip.detail", {
                      destination: destName,
                      first_stop: originName,
                      time: hhmm(c.departureMinute ?? 0),
                    });

                    return (
                      <Pressable
                        key={`${c.lineId}:${c.tripId}:${c.position}`}
                        accessibilityRole="button"
                        onPress={() => void handleChoose(c)}
                        style={({ pressed }) => [
                          styles.candidateCard,
                          { borderColor: colors.divider, backgroundColor: colors.surface },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <LineBadge code={cLineCode} color={cLineColor} />
                        <View style={styles.candidateText}>
                          <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                            {devText}
                          </Text>
                          <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                            {subText}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Ações no Rodapé: "Corrigir a hora" e "Não sei" */}
            <View style={styles.footerActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleAdjustTime}
                style={({ pressed }) => [
                  styles.footerButton,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {t("sheet_verify.fix_time")}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleDismiss()}
                style={({ pressed }) => [
                  styles.footerButton,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {t("sheet_verify.dont_know")}
                </Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  factCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    padding: space.md,
  },
  factText: {
    flex: 1,
    gap: 2,
  },
  explanationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
  },
  infoMark: {
    marginTop: 3,
  },
  explanationText: {
    flex: 1,
    lineHeight: 20,
  },
  section: {
    gap: space.xs,
  },
  candidateList: {
    gap: space.xs,
  },
  candidateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  candidateText: {
    flex: 1,
    gap: 2,
  },
  footerActions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  num: {
    fontVariant: ["tabular-nums"],
  },
});
