/**
 * TL-12 Ajustes → Avisos (E-06 Bloco 3, Item 4; plano §6, A7, A8, A9b).
 *
 * Folha empilhada com rolagem (quadro da VerifySheet, D-150, sem constante nova).
 * Seções em lista agrupada:
 * 1. Avisos ligados (alarmLine, ordenado por horário de saída; swipe para apagar com Desfazer; toque abre repeat).
 * 2. Enviar aviso de teste em 1 minuto (chama schedulerFor(db).scheduleTestAlarm()).
 * 3. Próximos avisos (upcomingList, até 10, recarrega ao voltar ao topo).
 * 4. Histórico (historyList, até 30, rodapé honesto sem prometer entrega).
 * 5. Modo Foco (reabre alarmIntro em modo foco).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { formatServiceMinute, lisbonWallClock } from "@notebus/domain";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlaces } from "../data/PlacesProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useToast } from "../data/ToastProvider";
import {
  alarmFromRow,
  alarmLine,
  alarmRowA11yActions,
  historyList,
  isDeleteAction,
  minuteText,
  upcomingList,
  weekdayPluralKey,
  type HistoryItem,
  type UpcomingItem,
} from "../data/alarmsUi";
import { realNow } from "../data/clock";
import { sharedAlarms, type AlarmRow } from "../db/alarms";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { expoPort } from "../notifications/expoPort";
import { requestReschedule, schedulerFor } from "../notifications/runtime";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph } from "../ui/Glyphs";
import { ListRow } from "../ui/ListRow";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { activeSheet } from "./stack";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";

const HeightContext = createContext<(height: number) => void>(() => {});

function AlarmsHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: AlarmsHandle };

export function AlarmsSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { state, dispatch } = useSheets();
  const places = usePlaces();
  const schedule = useSchedule();
  const toast = useToast();
  const db = getSharedDb();

  const [handleHeight, setHandleHeight] = useState(0);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const activeSwipeable = useRef<SwipeableMethods | null>(null);

  const isTop = activeSheet(state).id === id;

  const loadData = useCallback(async () => {
    if (!db) return;
    try {
      const repo = sharedAlarms(db);
      const allAlarms = await repo.listAlarms();
      setAlarms(allAlarms.filter((a) => a.enabled));

      const scheduled = await expoPort.listScheduled();
      setUpcoming(upcomingList(scheduled));

      const events = await repo.listEvents();
      setHistory(historyList(events, realNow()));
    } catch {
      // Ignora erro
    }
  }, [db]);

  useEffect(() => {
    if (isTop) {
      void loadData();
    }
  }, [isTop, loadData]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  // Metadados para linha do aviso (placeName, lineCode, leaveTime)
  const getMeta = useCallback(
    (alarm: AlarmRow) => {
      const option = places.options.find((o) => o.id === alarm.optionId);
      const route = places.routes.find((r) => r.id === option?.routeId);
      const place = places.places.find((p) => p.id === route?.destinationPlaceId);
      const placeName = place?.name ?? "";

      let lineCode = "";
      if (schedule.status === "ready" && option?.boardPatternStopId) {
        const ps = schedule.data.patternStopById.get(option.boardPatternStopId);
        if (ps) {
          const lineId = schedule.data.patternLineId.get(ps.patternId);
          if (lineId) {
            lineCode = schedule.data.lineInfo.get(lineId)?.code ?? "";
          }
        }
      }
      const leaveTime = minuteText(alarm.anchorBaseMinute);
      return { placeName, lineCode, leaveTime, baseMinute: alarm.anchorBaseMinute };
    },
    [places.options, places.places, places.routes, schedule],
  );

  // Ordena por horário de saída (minuto base)
  const sortedAlarms = [...alarms].sort((a, b) => {
    const metaA = getMeta(a);
    const metaB = getMeta(b);
    return metaA.baseMinute - metaB.baseMinute;
  });

  const handleDeleteAlarm = async (alarm: AlarmRow) => {
    if (!db) return;
    try {
      await sharedAlarms(db).deleteAlarm(alarm.id, realNow());
      requestReschedule();
      await loadData();
      toast.show({
        title: t("toast.alarm_cancelled.title"),
        action: {
          label: t("toast.action.undo"),
          run: async () => {
            try {
              const saveResult = await sharedAlarms(db).saveAlarm(alarmFromRow(alarm), realNow());
              requestReschedule();
              await loadData();
              if (saveResult.replaced.length > 0) {
                const rep = saveResult.replaced[0]!;
                const repDays =
                  rep.weekdays.length > 0
                    ? rep.weekdays.map((d) => t(weekdayPluralKey(d))).join(" ")
                    : t("alarm.repeat.once");
                const currentAlarms = await sharedAlarms(db).listAlarms();
                const oldAlarm = currentAlarms.find((a) => a.id === rep.alarmId);
                const repTime = oldAlarm ? minuteText(oldAlarm.anchorBaseMinute) : "";
                toast.show({
                  title: t("toast.alarm_replaced", { time: repTime, days: repDays }),
                  action: {
                    label: t("toast.action.undo"),
                    run: async () => {
                      try {
                        await saveResult.undo(realNow());
                        requestReschedule();
                        await loadData();
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
              toast.show({
                title: t("alarms.undo_failed"),
                kind: "error",
              });
            }
          },
        },
      });
    } catch {
      // Ignora erro
    }
  };

  const handleTestAlarm = async () => {
    if (!db) return;
    try {
      const result = await schedulerFor(db).scheduleTestAlarm();
      if (result.ok) {
        const timeStr = formatServiceMinute(lisbonWallClock(result.at).minute);
        toast.show({ title: t("alarms.test_scheduled", { time: timeStr }) });
        await loadData();
      } else if (result.reason === "permission_denied") {
        dispatch({ type: "push", sheet: { kind: "alarmIntro", mode: "denied" } });
      } else if (result.reason === "no_option") {
        toast.show({ title: t("alarms.test_no_option") });
      }
    } catch {
      // Ignora erro
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
            {/* Cabeçalho */}
            <Text style={[type.title, styles.headerTitle, { color: colors.text }]}>
              {t("alarms.title")}
            </Text>

            {/* 1. Avisos Ligados */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("alarms.title")}
              </Text>

              {sortedAlarms.length === 0 ? (
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("alarms.empty")}
                </Text>
              ) : (
                <View style={styles.groupedList}>
                  {sortedAlarms.map((item) => (
                    <AlarmListItem
                      key={item.id}
                      alarm={item}
                      meta={getMeta(item)}
                      onPress={() =>
                        dispatch({
                          type: "push",
                          sheet: { kind: "repeat", alarmId: item.id },
                        })
                      }
                      onDelete={() => void handleDeleteAlarm(item)}
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
                </View>
              )}

              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("alarms.edit_hint")}
              </Text>
            </View>

            {/* 2. Enviar aviso de teste em 1 minuto */}
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("alarms.test_button")}
                onPress={() => void handleTestAlarm()}
                style={({ pressed }) => [
                  styles.testButton,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {t("alarms.test_button")}
                </Text>
              </Pressable>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("alarms.test_hint")}
              </Text>
            </View>

            {/* 3. Próximos avisos */}
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("alarms.next")}
                </Text>
                <View style={styles.groupedList}>
                  {upcoming.map((u) => (
                    <View
                      key={u.id}
                      style={[styles.upcomingRow, { borderBottomColor: colors.divider }]}
                    >
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{u.time}</Text>
                      <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>
                        {u.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 4. Histórico */}
            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("alarms.history")}
                </Text>
                <View style={styles.groupedList}>
                  {history.map((h) => (
                    <View
                      key={h.id}
                      style={[styles.historyRow, { borderBottomColor: colors.divider }]}
                    >
                      <View style={styles.historyLeft}>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>
                          {h.time}
                        </Text>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {h.dateText}
                        </Text>
                      </View>
                      <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>
                        {h.statusLabel}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("alarms.history_note")}
                </Text>
              </View>
            )}

            {/* 5. Modo Foco */}
            <View style={styles.section}>
              <ListRow
                title={t("alarms.focus_row")}
                accessibilityLabel={t("alarms.focus_row")}
                onPress={() =>
                  dispatch({
                    type: "push",
                    sheet: { kind: "alarmIntro", mode: "focus" },
                  })
                }
              />
            </View>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function AlarmListItem({
  alarm,
  meta,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
}: {
  alarm: AlarmRow;
  meta: { placeName: string; lineCode: string; leaveTime: string };
  onPress: () => void;
  onDelete: () => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const lineText = alarmLine(alarm, meta);

  const handleWillOpen = () => {
    if (swipeableRef.current) {
      onWillOpen(swipeableRef.current);
    }
  };

  const handleSwipeClose = () => {
    if (swipeableRef.current) {
      onClose(swipeableRef.current);
    }
  };

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleSwipeClose}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lineText}
        accessibilityActions={alarmRowA11yActions()}
        onAccessibilityAction={(event) => {
          if (isDeleteAction(event.nativeEvent.actionName)) {
            onDelete();
          }
        }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.alarmRow,
          { borderBottomColor: colors.divider, backgroundColor: colors.bg },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>{lineText}</Text>
        <ChevronRightGlyph color={colors.textSecondary} />
      </Pressable>
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
  section: {
    gap: space.xs,
  },
  groupedList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  alarmRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    gap: space.sm,
  },
  deleteButton: {
    minWidth: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.md,
  },
  testButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  upcomingRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    gap: space.md,
  },
  historyRow: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    gap: space.md,
  },
  historyLeft: {
    minWidth: 54,
    gap: 2,
  },
});
