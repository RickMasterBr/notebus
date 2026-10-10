/**
 * Folha "Exceções passadas" (TL-12, E-08 bloco 1b, Item 4.4).
 *
 * Lista de exceções passadas (da mais recente para a mais antiga).
 * Só leitura e apagar deslizando com Desfazer.
 * Vazia → texto override.past.empty.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { lisbonWallClock } from "@notebus/domain";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendarEdits } from "../data/CalendarEditsProvider";
import { useNow } from "../data/NowProvider";
import { useSchedule } from "../data/ScheduleProvider";
import {
  formatOverrideLine,
  splitOverrides,
} from "../data/settingsView";
import { useToast } from "../data/ToastProvider";
import {
  type CalendarOverrideItem,
  listOverrides,
} from "../db/calendarList";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { activeSheet } from "./stack";
import { useSheets } from "./SheetsContext";
import { closeAndClearSwipeable, openSingleSwipeable } from "./swipeCoordinator";

const HeightContext = createContext<(height: number) => void>(() => {});

function PastOverridesHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: PastOverridesHandle };

export function PastOverridesSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { state } = useSheets();
  const calendarEdits = useCalendarEdits();
  const schedule = useSchedule();
  const now = useNow();
  const toast = useToast();
  const db = getSharedDb();

  const [handleHeight, setHandleHeight] = useState(0);
  const [items, setItems] = useState<CalendarOverrideItem[]>([]);
  const activeSwipeable = useRef<SwipeableMethods | null>(null);

  const isTop = activeSheet(state).id === id;

  const loadData = useCallback(async () => {
    if (!db) return;
    try {
      const list = await listOverrides(db);
      const todayLisbon = lisbonWallClock(now()).date;
      const { past } = splitOverrides(list, todayLisbon);
      setItems(past);
    } catch {
      // Ignora erro
    }
  }, [db, now]);

  useEffect(() => {
    if (isTop) {
      void loadData();
    }
  }, [isTop, schedule, loadData]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const handleDelete = async (item: CalendarOverrideItem) => {
    const res = await calendarEdits.deleteOverride(item.id, now());
    if (res.ok) {
      void loadData();
      toast.show({
        title: t("override.deleted"),
        action: {
          label: t("toast.action.undo"),
          run: async () => {
            await res.undo(now());
            void loadData();
          },
        },
      });
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
              {t("override.past.title")}
            </Text>

            {items.length === 0 ? (
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {t("override.past.empty")}
              </Text>
            ) : (
              <View style={styles.groupedList}>
                {items.map((item) => (
                  <PastOverrideRow
                    key={item.id}
                    item={item}
                    onDelete={() => void handleDelete(item)}
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
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function PastOverrideRow({
  item,
  onDelete,
  onWillOpen,
  onClose,
}: {
  item: CalendarOverrideItem;
  onDelete: () => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const lineText = formatOverrideLine(item.date, item.dayTypeCode);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClose(swipeableRef.current);
      }}
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
      <View
        accessibilityRole="text"
        accessibilityLabel={lineText}
        accessibilityActions={[{ name: "delete", label: t("alarms.delete") }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") {
            onDelete();
          }
        }}
        style={[
          styles.row,
          { borderBottomColor: colors.divider, backgroundColor: colors.bg },
        ]}
      >
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>{lineText}</Text>
      </View>
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
  groupedList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  deleteButton: {
    minWidth: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.md,
  },
});
