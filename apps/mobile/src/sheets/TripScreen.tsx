import { BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { baseTimeAt, displayCenter, expectedTime } from "@notebus/domain";
import * as Haptics from "expo-haptics";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { useStopIndex } from "../data/StopIndexProvider";
import { realNow } from "../data/clock";
import { buildAlightList } from "../data/alightList";
import { alightRecordTime } from "../data/alightTime";
import { passageTarget } from "../data/records";
import type { AlightRow } from "../data/rideView";
import { boardingOf, serviceMinuteOn } from "../data/rideView";
import { clockText } from "../data/stopCard";
import { useTripAlightChoice } from "../data/tripAlightChoice";
import { tripProgress } from "../data/tripProgress";
import { tripDone, tripHeader } from "../data/tripScreenView";
import { tripSummary } from "../data/tripSummary";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { NoticeLine } from "../ui/NoticeCard";
import { RouteStopRow } from "../ui/RouteStopRow";
import { ScreenTopBar } from "../ui/ScreenTopBar";
import { TripLegCard, type TripLegCardAlight } from "../ui/TripLegCard";
import { TripProgress } from "../ui/TripProgress";
import { routeStopVariant } from "../ui/componentRules";
import { pressedStyle } from "../ui/pressed";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});
const TitleContext = createContext<string>("");

function TripTopBar({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  const title = useContext(TitleContext);
  const close = useCloseSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <ScreenTopBar
        title={title}
        variant="modal"
        onBack={onClose ?? close}
      />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: TripTopBar };

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function TripScreen({ id }: { id: number }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { colors } = useTheme();
  const { tripCard: card, status, alight, rides, observations, records } = useRegistro();
  const schedule = useSchedule();
  const index = useStopIndex();
  const now = useNowTick();
  const close = useCloseSheet();
  const choice = useTripAlightChoice(card?.rideId ?? null);

  const [search, setSearch] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [doneText, setDoneText] = useState<string | null>(null);
  const [handleHeight, setHandleHeight] = useState(0);

  const openedAtRef = useRef<number | null>(null);
  if (openedAtRef.current === null) {
    openedAtRef.current = realNow();
  }
  const openedAt = openedAtRef.current;

  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (status === "ready" && card === null && !doneText) {
      close();
    }
  }, [status, card, doneText, close]);

  const data = schedule.status === "ready" ? schedule.data : null;
  const currentMinute = card?.trip ? serviceMinuteOn(card.trip.serviceDate, now) : null;

  const { rows, highlightedPosition } = useMemo(() => {
    if (!card || !data) return { rows: [], highlightedPosition: null };
    return buildAlightList(card, data, openedAt, choice.position);
  }, [card, data, openedAt, choice.position]);

  const summary = useMemo(() => {
    if (!card || !data) return null;
    return tripSummary(card, data, choice.position, now);
  }, [card, data, choice.position, now]);

  const header = useMemo(() => {
    return tripHeader(summary, rows, choice.position, currentMinute);
  }, [summary, rows, choice.position, currentMinute]);

  const title = useMemo(() => {
    if (header.kind === "arrives") return t("trip.title.arrives", { minutes: header.minutes });
    if (header.kind === "ongoing") return t("trip.title.ongoing");
    return t("home.trip.title_no_destination");
  }, [header]);

  const progressFraction = useMemo(() => {
    if (!card?.trip) return null;
    return tripProgress(rows, card.trip.boardPosition, choice.position, currentMinute);
  }, [rows, card?.trip, choice.position, currentMinute]);

  const externalIds = useMemo(
    () => new Map(index.status === "ready" ? index.stops.map((s) => [s.id, s.externalId] as const) : []),
    [index],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim();
    if (rows.length <= 12 || query === "") return rows;
    const normalized = stripAccents(query);
    return rows.filter((r) => stripAccents(r.name).includes(normalized));
  }, [rows, search]);

  const alightLeg: TripLegCardAlight | null = useMemo(() => {
    if (choice.position === null || !data || !card?.trip) return null;
    const chosenRow = rows.find((r) => r.position === choice.position);
    if (!chosenRow) return null;
    const trip = data.trips.find((t) => t.id === card.trip!.tripId);
    const base = trip ? baseTimeAt(trip, chosenRow.position) : null;
    const tableTime = base ? clockText(displayCenter(base.minute)) : null;
    const target = card.trip
      ? passageTarget(data, card.trip.tripId, chosenRow.position, card.trip.serviceDate)
      : null;
    let usualTime: string | null = null;
    if (base && target && records.length > 0) {
      const exp = expectedTime(base, records, { target, now });
      if (exp.confidence !== "low") {
        usualTime = clockText(displayCenter(exp.center));
      }
    }
    return {
      time: chosenRow.time,
      approximate: chosenRow.approximate,
      stopName: chosenRow.name,
      tableTime,
      usualTime,
    };
  }, [choice.position, rows, data, card?.trip, records, now]);

  const durationText = useMemo(() => {
    if (choice.position === null || !card?.trip || !data) return "";
    const chosenRow = rows.find((r) => r.position === choice.position);
    if (!chosenRow) return "";
    const trip = data.trips.find((t) => t.id === card.trip!.tripId);
    const boardBase = trip ? baseTimeAt(trip, card.trip.boardPosition) : null;
    if (!boardBase) return "";
    const boardMinute = boardBase.minute + (card.rideDeviation ?? 0);
    const dur = Math.max(0, Math.round(chosenRow.minute - boardMinute));
    return t("common.min", { min: dur });
  }, [choice.position, rows, card?.trip, card?.rideDeviation, data]);

  const directionLabel = card?.destination
    ? t("sheet_stop.line_direction", { destination: card.destination })
    : "";

  const cardA11y = useMemo(() => {
    if (!card) return "";
    if (alightLeg) {
      return `${card.stopName}, ${card.boardedTime}, ${alightLeg.stopName}, ${alightLeg.time}, ${card.line?.code ?? ""}, ${directionLabel}, ${durationText}`;
    }
    return `${card.stopName}, ${card.boardedTime}, ${card.line?.code ?? ""}, ${directionLabel}`;
  }, [card, alightLeg, directionLabel, durationText]);

  const handleAlightRow = useCallback(
    async (row: AlightRow) => {
      if (!card?.trip || busyRef.current) return;
      busyRef.current = true;
      try {
        const currentMin = serviceMinuteOn(card.trip.serviceDate, now);
        const timeOpts = alightRecordTime({
          expectedMinute: row.minute,
          nowMinute: currentMin,
          now,
        });
        const ok = await alight(card, row, timeOpts);
        if (ok) {
          choice.choose(null);
          const openRide = rides.find((r) => r.id === card.rideId);
          const boarding = openRide ? boardingOf(openRide, observations) : undefined;
          const boardedAt = boarding?.observedAt ?? now;
          const doneResult = tripDone({
            boardedAt,
            alightedAt: timeOpts.observedAt,
            alightRow: row,
            rideDeviation: card.rideDeviation,
            alightedMinute: serviceMinuteOn(card.trip.serviceDate, timeOpts.observedAt),
          });
          let text = t("trip.done", { minutes: doneResult.minutes });
          if (doneResult.delta && doneResult.delta.direction === "late") {
            text = `${text} · ${t("trip.done.late", { n: doneResult.delta.minutes })}`;
          } else if (doneResult.delta && doneResult.delta.direction === "early") {
            text = `${text} · ${t("trip.done.early", { n: doneResult.delta.minutes })}`;
          }
          setDoneText(text);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          doneTimerRef.current = setTimeout(() => {
            close();
          }, 2000);
        } else {
          busyRef.current = false;
        }
      } catch {
        busyRef.current = false;
      }
    },
    [card, now, alight, choice, rides, observations, close],
  );

  const handleStopPress = useCallback(
    (row: AlightRow) => {
      if (choosing) {
        choice.choose(row.position);
        setChoosing(false);
        return;
      }
      void handleAlightRow(row);
    },
    [choosing, choice, handleAlightRow],
  );

  const handleAlightHere = useCallback(() => {
    if (choosing) return;
    const targetRow = rows.find((r) => r.position === highlightedPosition);
    if (targetRow) void handleAlightRow(targetRow);
  }, [choosing, rows, highlightedPosition, handleAlightRow]);

  const initialScrollIndex = useMemo(() => {
    if (highlightedPosition === null) return undefined;
    const idx = rows.findIndex((r) => r.position === highlightedPosition);
    return idx >= 0 ? idx : undefined;
  }, [rows, highlightedPosition]);

  const secondBtnLabel = choosing
    ? t("common.cancel")
    : choice.position !== null
      ? t("trip.change_alight")
      : t("trip.choose_alight");

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  return (
    <TitleContext.Provider value={title}>
      <HeightContext.Provider value={setHandleHeight}>
        <StackedSheet id={id} detents={DETENTS}>
          <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
            {doneText ? (
              <View style={styles.doneContainer}>
                <Text style={[type.title, { color: colors.text, textAlign: "center" }]}>
                  {doneText}
                </Text>
              </View>
            ) : (
              <>
                <BottomSheetFlatList
                  data={filteredRows}
                  keyExtractor={(item) => String(item.position)}
                  initialScrollIndex={initialScrollIndex}
                  onScrollToIndexFailed={() => {}}
                  ListHeaderComponent={
                    <View style={styles.headerContainer}>
                      {header.kind === "ongoing" ? (
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("trip.next_stop", { stop_name: header.nextStopName })}
                        </Text>
                      ) : null}
                      {progressFraction !== null ? (
                        <TripProgress
                          fraction={progressFraction}
                          accessibilityLabel={t("trip.remaining.a11y", { n: header.remaining })}
                        />
                      ) : null}
                      {card ? (
                        <TripLegCard
                          boardTime={card.boardedTime}
                          boardStopName={card.stopName}
                          alight={alightLeg}
                          lineCode={card.line?.code ?? ""}
                          lineColor={card.line?.color ?? colors.accent}
                          directionLabel={directionLabel}
                          durationText={durationText}
                          onChooseAlight={() => setChoosing(true)}
                          accessibilityLabel={cardA11y}
                        />
                      ) : null}
                      {rows.length > 12 ? (
                        <View style={[styles.searchPill, { backgroundColor: colors.fill }]}>
                          <BottomSheetTextInput
                            value={search}
                            onChangeText={setSearch}
                            placeholder={t("trip.search.placeholder")}
                            placeholderTextColor={colors.textSecondary}
                            accessibilityLabel={t("trip.search.placeholder")}
                            autoCorrect={false}
                            autoCapitalize="none"
                            returnKeyType="search"
                            style={[type.body, styles.searchInput, { color: colors.text }]}
                          />
                        </View>
                      ) : null}
                      {choosing ? <NoticeLine text={t("trip.choose.hint")} /> : null}
                    </View>
                  }
                  renderItem={({ item, index: rowIndex }) => {
                    const passLabel = item.number
                      ? t("sheet_alight.pass_ordinal", { ordinal: `${item.number}ª` })
                      : null;
                    const extId = externalIds.get(item.stopId) ?? null;
                    const timeLabel = item.approximate ? `~${item.time}` : item.time;
                    const rowA11y = [item.name, passLabel, timeLabel, extId].filter(Boolean).join(", ");

                    return (
                      <RouteStopRow
                        name={item.name}
                        time={item.time}
                        approximate={item.approximate}
                        passLabel={passLabel}
                        externalId={extId}
                        lineColor={card?.line?.color ?? colors.accent}
                        highlighted={item.position === highlightedPosition}
                        variant={routeStopVariant({ pickable: true, passed: false })}
                        isFirst={rowIndex === 0}
                        isLast={rowIndex === filteredRows.length - 1}
                        accessibilityLabel={rowA11y}
                        onPress={() => handleStopPress(item)}
                      />
                    );
                  }}
                  contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: space.md },
                  ]}
                  showsVerticalScrollIndicator={false}
                />
                <View
                  style={[
                    styles.footer,
                    { paddingBottom: insets.bottom + space.sm, backgroundColor: colors.surface },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("trip.alight_here")}
                    disabled={choosing}
                    onPress={handleAlightHere}
                    style={({ pressed }) => [
                      styles.footerBtnPrimary,
                      { backgroundColor: colors.accent },
                      choosing ? { opacity: 0.5 } : null,
                      pressedStyle(pressed, choosing),
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                      {t("trip.alight_here")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={secondBtnLabel}
                    onPress={() => setChoosing((prev) => !prev)}
                    style={({ pressed }) => [
                      styles.footerBtnSecondary,
                      pressedStyle(pressed),
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>
                      {secondBtnLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </StackedSheet>
      </HeightContext.Provider>
    </TitleContext.Provider>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    gap: space.md,
    marginBottom: space.md,
  },
  listContent: {
    paddingHorizontal: space.md,
  },
  searchPill: {
    height: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  searchInput: {
    paddingVertical: 0,
  },
  doneContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  footer: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "transparent",
  },
  footerBtnPrimary: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  footerBtnSecondary: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
});
