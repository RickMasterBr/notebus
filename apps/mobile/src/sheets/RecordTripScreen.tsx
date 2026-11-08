/**
 * TL-08 Viagem registrada como tela (D-396, D-414).
 * Mostra o tripPageModel da viagem, botões de editar e apagar,
 * e a seção "Onde você desceu?" caso a viagem esteja sem descida em noAlightIds.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { lisbonWallClock } from "@notebus/domain";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { useToast } from "../data/ToastProvider";
import { useNowTick } from "../data/useNowTick";
import { tripPageModel } from "../data/recordsTripPage";
import { unansweredNoAlight } from "../data/recordsScreen";
import { buildAlightList } from "../data/alightList";
import { alightRecordTime } from "../data/alightTime";
import type { AlightRow } from "../data/rideView";
import { buildTripCard, serviceMinuteOn } from "../data/rideView";
import { matchNetworkOf, passageRecords } from "../data/records";
import { clockText } from "../data/stopCard";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { LineBadge } from "../ui/LineBadge";
import { NoticeCard, NoticeLine } from "../ui/NoticeCard";
import { RouteStopRow } from "../ui/RouteStopRow";
import { ScreenTopBar } from "../ui/ScreenTopBar";
import { routeStopVariant } from "../ui/componentRules";
import { pressedStyle } from "../ui/pressed";
import { hitSlopToMinTouch } from "../ui/touch";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});
const TitleContext = createContext<string>("");

function RecordTripTopBar({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const title = useContext(TitleContext);
  const close = useCloseSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <ScreenTopBar
        title={title}
        onBack={onClose ?? close}
      />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: RecordTripTopBar };

const ordinal = (n: number) => `${n}ª`;

export function RecordTripScreen({
  id,
  boardingId,
}: {
  id: number;
  boardingId: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dispatch } = useSheets();
  const registro = useRegistro();
  const schedule = useSchedule();
  const toast = useToast();
  const instant = useNowTick();
  const close = useCloseSheet();

  const [handleHeight, setHandleHeight] = useState(0);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const tripModel = useMemo(() => {
    return tripPageModel({
      boardingId,
      observations: registro.observations,
      rides: registro.rides,
      snapshot: scheduleData,
      now: instant,
    });
  }, [boardingId, registro.observations, registro.rides, scheduleData, instant]);

  useEffect(() => {
    if (registro.status === "ready" && tripModel === null) {
      close();
    }
  }, [registro.status, tripModel, close]);

  const routeText = tripModel
    ? tripModel.toName != null
      ? t("sheet_records.trip.route", { from: tripModel.fromName, to: tripModel.toName })
      : t("sheet_records.trip.route_unknown", { from: tripModel.fromName })
    : t("sheet_records.title");

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const isNoAlight = useMemo(() => {
    const ids = unansweredNoAlight(registro.observations, registro.rides);
    return ids.includes(boardingId);
  }, [registro.observations, registro.rides, boardingId]);

  const boardingObs = useMemo(
    () => registro.observations.find((o) => o.id === boardingId && o.deletedAt == null),
    [registro.observations, boardingId],
  );

  const ride = useMemo(
    () => registro.rides.find((r) => r.boardingObservationId === boardingId && r.deletedAt == null),
    [registro.rides, boardingId],
  );

  const card = useMemo(() => {
    if (!ride || !boardingObs || !scheduleData) return null;
    const records = passageRecords(registro.observations, scheduleData);
    return buildTripCard(
      ride.id,
      boardingObs,
      scheduleData,
      matchNetworkOf(scheduleData),
      records,
      boardingObs.observedAt,
    );
  }, [ride, boardingObs, scheduleData, registro.observations]);

  const alightRows = useMemo(() => {
    if (!card || !scheduleData || !boardingObs) return [];
    return buildAlightList(card, scheduleData, boardingObs.observedAt, null).rows;
  }, [card, scheduleData, boardingObs]);

  const handleChooseAlight = useCallback(
    async (row: AlightRow) => {
      if (!card?.trip || !ride) return;
      const nowMinute = serviceMinuteOn(card.trip.serviceDate, instant);
      const { observedAt } = alightRecordTime({
        expectedMinute: row.minute,
        nowMinute,
        now: instant,
      });

      const result = await registro.alightLater({
        rideId: ride.id,
        stopId: row.stopId,
        patternId: card.trip.patternId,
        position: row.position,
        observedAt,
        at: instant,
      });

      if (result.ok) {
        const timeText = clockText(lisbonWallClock(observedAt).minute);
        toast.show({
          title: t("toast.alight_later.title"),
          body: t("toast.alight_later.body", { stop_name: row.name, time: timeText }),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.undoAlightLater(result.token);
                  toast.show({
                    title: t("toast.undo_done.title"),
                    body: t("toast.undo_alight.body"),
                  });
                } catch {
                  // Falha ao desfazer
                }
              })(),
          },
        });
      }
    },
    [card, ride, instant, registro, toast],
  );

  const handleDismissNoAlight = useCallback(async () => {
    if (!ride) return;
    try {
      await registro.dismissNoAlight(ride.id);
      toast.show({
        title: t("toast.dont_know.title"),
        body: t("toast.dont_know.body"),
        action: {
          label: t("toast.action.undo"),
          run: () =>
            void (async () => {
              try {
                await registro.undoDismissNoAlight(ride.id);
                toast.show({
                  title: t("toast.undo_done.title"),
                  body: t("toast.undo_verify.body"),
                });
              } catch {
                // Falha ao desfazer
              }
            })(),
        },
      });
    } catch {
      // Falha ao dispensar
    }
  }, [ride, registro, toast]);

  const handleDeleteTrip = useCallback(async () => {
    if (!tripModel) return;
    try {
      await registro.remove(tripModel.boarding.id);
      close();
    } catch {
      // Se falhar, fica na página
    }
  }, [tripModel, registro, close]);

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <TitleContext.Provider value={routeText}>
        <StackedSheet id={id} detents={DETENTS}>
          <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
            {tripModel && (
              <BottomSheetScrollView
                contentContainerStyle={[
                  styles.pageScrollContent,
                  { paddingBottom: insets.bottom + space.lg },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {/* Título: Linha + Trecho */}
                <View style={styles.pageTitleRow}>
                  <LineBadge code={tripModel.line.code} color={tripModel.line.color} />
                  <Text accessibilityRole="header" style={[type.title, { color: colors.text, flex: 1 }]}>
                    {routeText}
                  </Text>
                </View>

                {/* Subtítulo: Data e Duração */}
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {tripModel.durationMin != null
                    ? t("sheet_records.page.subtitle", {
                        day: tripModel.dayLabel,
                        duration: t("sheet_records.trip.duration", { n: tripModel.durationMin }),
                      })
                    : tripModel.dayLabel}
                </Text>

                {/* Bloco Embarque e Descida */}
                <View
                  style={[
                    styles.cardGroup,
                    { borderColor: colors.divider, backgroundColor: colors.surface },
                  ]}
                >
                  {/* Embarque */}
                  <View
                    style={[
                      styles.pagePointRow,
                      {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.divider,
                      },
                    ]}
                  >
                    <View style={[styles.pointDot, { backgroundColor: colors.accent }]} />
                    <View style={styles.pointInfo}>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {t("sheet_records.page.boarding")}
                      </Text>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>
                        {tripModel.boarding.time} · {tripModel.boarding.stopName}
                      </Text>
                      {tripModel.boarding.tableTime != null && (
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {tripModel.boarding.delta != null
                            ? t("sheet_records.page.table_line", {
                                time: tripModel.boarding.tableTime,
                                delta: t(tripModel.boarding.delta.key, {
                                  minutes: tripModel.boarding.delta.n,
                                }),
                              })
                            : t("sheet_records.page.table_line_plain", {
                                time: tripModel.boarding.tableTime,
                              })}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t("sheet_records.page.edit")} ${t("sheet_records.page.boarding")}`}
                      onPress={() =>
                        dispatch({
                          type: "push",
                          sheet: { kind: "record", observationId: tripModel.boarding.id },
                        })
                      }
                      style={({ pressed }) => [styles.editHitTarget, pressedStyle(pressed)]}
                    >
                      <Text style={[type.bodyStrong, { color: colors.accent }]}>
                        {t("sheet_records.page.edit")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Descida */}
                  <View style={styles.pagePointRow}>
                    <View style={[styles.pointDotRing, { borderColor: colors.accent }]} />
                    <View style={styles.pointInfo}>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {t("sheet_records.page.alighting")}
                      </Text>
                      {tripModel.alighting != null ? (
                        <Text style={[type.bodyStrong, { color: colors.text }]}>
                          {tripModel.alighting.time} · {tripModel.alighting.stopName}
                        </Text>
                      ) : (
                        <Text style={[type.body, { color: colors.textSecondary }]}>
                          {tripModel.ongoing
                            ? t("sheet_records.page.alight_open")
                            : t("sheet_records.page.alight_missing")}
                        </Text>
                      )}
                    </View>
                    {tripModel.alighting != null && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t("sheet_records.page.edit")} ${t("sheet_records.page.alighting")}`}
                        onPress={() =>
                          dispatch({
                            type: "push",
                            sheet: { kind: "record", observationId: tripModel.alighting!.id },
                          })
                        }
                        style={({ pressed }) => [styles.editHitTarget, pressedStyle(pressed)]}
                      >
                        <Text style={[type.bodyStrong, { color: colors.accent }]}>
                          {t("sheet_records.page.edit")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Seção Onde você desceu? */}
                {isNoAlight && (
                  <View style={styles.noAlightSection}>
                    <Text accessibilityRole="header" style={[type.subtitle, { color: colors.text }]}>
                      {t("sheet_alight.title")}
                    </Text>
                    {!card || !card.trip ? (
                      <NoticeLine text={t("records.no_alight.unknown")} />
                    ) : (
                      <>
                        <NoticeCard
                          title={t("sheet_alight.title")}
                          body={t("records.no_alight.body")}
                          tone="warning"
                        />
                        <View style={styles.stopsList}>
                          {alightRows.map((row, i) => {
                            const time = row.approximate ? `~${row.time}` : row.time;
                            const subtitle = t("sheet_alight.stop.subtitle_no_id", { time });
                            const pass =
                              row.number !== null
                                ? t("sheet_alight.pass_ordinal", { ordinal: ordinal(row.number) })
                                : null;
                            const a11y = [row.name, pass, subtitle].filter(Boolean).join(", ");
                            return (
                              <RouteStopRow
                                key={row.position}
                                name={row.name}
                                time={row.time}
                                approximate={row.approximate}
                                passLabel={pass}
                                lineColor={card.line?.color ?? colors.divider}
                                highlighted={false}
                                variant={routeStopVariant({ pickable: true, passed: true })}
                                isFirst={i === 0}
                                isLast={i === alightRows.length - 1}
                                accessibilityLabel={a11y}
                                onPress={() => handleChooseAlight(row)}
                              />
                            );
                          })}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("sheet_records.pending.unsure")}
                          hitSlop={hitSlopToMinTouch(36)}
                          onPress={handleDismissNoAlight}
                          style={({ pressed }) => [styles.unsureButton, pressedStyle(pressed)]}
                        >
                          <Text style={[type.bodyStrong, { color: colors.accent }]}>
                            {t("sheet_records.pending.unsure")}
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}

                {/* Cartão de aprendizado */}
                <View style={[styles.learnCard, { backgroundColor: colors.highlight }]}>
                  <Text style={[type.body, { color: colors.text }]}>
                    {tripModel.learn === "learns"
                      ? t("sheet_records.page.learns", {
                          line: tripModel.line.code,
                          stop: tripModel.fromName,
                        })
                      : t("sheet_records.page.unmatched")}
                  </Text>
                </View>

                {/* Viagem da tabela e Nota */}
                {(tripModel.originTable != null || tripModel.note != null) && (
                  <View
                    style={[
                      styles.cardGroup,
                      { borderColor: colors.divider, backgroundColor: colors.surface },
                    ]}
                  >
                    {tripModel.originTable != null && (
                      <View
                        style={[
                          styles.tableTripRow,
                          tripModel.note != null && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.divider,
                          },
                        ]}
                      >
                        <Text style={[type.body, { color: colors.text, fontWeight: "500" }]}>
                          {t("sheet_records.page.table_trip")}
                        </Text>
                        <Text style={[type.body, { color: colors.textSecondary }]}>
                          {t("sheet_records.page.table_trip_value", {
                            time: tripModel.originTable.time,
                            stop: tripModel.originTable.stopName,
                          })}
                        </Text>
                      </View>
                    )}
                    {tripModel.note != null && (
                      <View style={styles.tableTripRow}>
                        <Text style={[type.body, { color: colors.text, fontWeight: "500" }]}>
                          {t("sheet_records.page.note")}
                        </Text>
                        <Text style={[type.body, { color: colors.textSecondary }]}>
                          {tripModel.note}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Botão Conferir */}
                {tripModel.verifyId !== null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      dispatch({
                        type: "push",
                        sheet: { kind: "verify", observationId: tripModel.verifyId! },
                      })
                    }
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.accent },
                      pressedStyle(pressed),
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                      {t("sheet_records.pending.check")}
                    </Text>
                  </Pressable>
                )}

                {/* Botão Apagar viagem */}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleDeleteTrip}
                  style={({ pressed }) => [
                    styles.deleteTripButton,
                    { backgroundColor: colors.fill },
                    pressedStyle(pressed),
                  ]}
                >
                  <Text style={[type.bodyStrong, { color: colors.danger }]}>
                    {t("sheet_records.page.delete")}
                  </Text>
                </Pressable>
                <Text
                  style={[
                    type.caption,
                    styles.deleteHintText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {tripModel.deleteKind === "pair"
                    ? t("sheet_records.page.delete_hint")
                    : t("sheet_records.page.delete_hint_single")}
                </Text>
              </BottomSheetScrollView>
            )}
          </View>
        </StackedSheet>
      </TitleContext.Provider>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  pageScrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  cardGroup: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  pagePointRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    gap: space.md,
  },
  pointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pointDotRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  pointInfo: {
    flex: 1,
    gap: 2,
  },
  editHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  learnCard: {
    borderRadius: radius.md,
    padding: space.md,
  },
  tableTripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: space.md,
  },
  primaryButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  deleteTripButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  deleteHintText: {
    textAlign: "center",
    marginTop: -space.xs,
  },
  noAlightSection: {
    gap: space.sm,
    paddingVertical: space.xs,
  },
  stopsList: {
    paddingVertical: space.xs,
  },
  unsureButton: {
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xs,
  },
});
