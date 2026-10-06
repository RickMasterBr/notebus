/**
 * TL-10 Lugares (D-063, A9; 4.6 §3.11).
 *
 * Lista de lugares e atalhos:
 * - Atalhos na ordem da tela inicial, com reordenação pura (reorder) e acessibilidade VoiceOver (Mover para cima/baixo).
 * - "Novo lugar" para cadastrar.
 * - Toque no lugar abre PlaceSheet.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlaces } from "../data/PlacesProvider";
import { type PlaceRow, reorder } from "../db/places";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph, CrossGlyph, DragHandleGlyph, PlaceIconGlyph, PlusGlyph } from "../ui/Glyphs";
import { useReorderTransition } from "../ui/useReorderTransition";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function PlacesHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: PlacesHandle };

interface ShortcutCardItemProps {
  place: PlaceRow;
  index: number;
  total: number;
  routesCount: number;
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>;
  onPress: () => void;
}

function ShortcutCardItem({
  place,
  index,
  total,
  routesCount,
  onReorder,
  onPress,
}: ShortcutCardItemProps) {
  const { colors } = useTheme();
  const reorderTransition = useReorderTransition();
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const itemHeight = useSharedValue(64);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const delta = Math.round(event.translationY / Math.max(itemHeight.value, 40));
      const target = Math.min(Math.max(0, index + delta), total - 1);
      if (target !== index) {
        runOnJS(onReorder)(index, target);
      }
    })
    .onFinalize(() => {
      translateY.value = withSpring(0);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
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
    };
  });

  const a11yActions = [
    ...(index > 0 ? [{ name: "moveUp", label: t("places.reorder.up") }] : []),
    ...(index < total - 1 ? [{ name: "moveDown", label: t("places.reorder.down") }] : []),
  ];

  return (
    <Animated.View
      layout={reorderTransition}
      style={animatedStyle}
      onLayout={(e) => {
        itemHeight.value = e.nativeEvent.layout.height + space.sm;
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${place.name}, ${t("places.routes_to", { count: routesCount })}`}
        accessibilityActions={a11yActions}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "moveUp" && index > 0) {
            void onReorder(index, index - 1);
          } else if (event.nativeEvent.actionName === "moveDown" && index < total - 1) {
            void onReorder(index, index + 1);
          }
        }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.fill },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.cardLeft}>
          <GestureDetector gesture={pan}>
            <View
              style={styles.dragHandleHitTarget}
              accessibilityElementsHidden={true}
              importantForAccessibility="no"
            >
              <DragHandleGlyph color={colors.textSecondary} />
            </View>
          </GestureDetector>
          <PlaceIconGlyph icon={place.icon} color={colors.accent} size={22} />
          <View style={styles.cardText}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{place.name}</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {t("places.routes_to", { count: routesCount })}
            </Text>
          </View>
        </View>
        <ChevronRightGlyph color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

export function PlacesSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const places = usePlaces();
  const [handleHeight, setHandleHeight] = useState(0);

  const shortcuts = places.shortcuts;

  const nonShortcuts = useMemo(
    () => places.places.filter((p) => !p.isShortcut && p.deletedAt === null),
    [places.places],
  );

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || fromIndex >= shortcuts.length || toIndex < 0 || toIndex >= shortcuts.length) return;
      const ids = shortcuts.map((s) => s.id);
      const reorderedIds = reorder(ids, fromIndex, toIndex);
      await places.reorderShortcuts(reorderedIds);
    },
    [shortcuts, places],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const renderNonShortcutCard = (place: PlaceRow) => {
    const routesCount = places.routes.filter(
      (r) =>
        r.destinationPlaceId === place.id &&
        r.deletedAt === null &&
        places.options.some((o) => o.routeId === r.id && o.deletedAt === null),
    ).length;

    return (
      <Pressable
        key={place.id}
        accessibilityRole="button"
        accessibilityLabel={`${place.name}, ${t("places.routes_to", { count: routesCount })}`}
        onPress={() => dispatch({ type: "push", sheet: { kind: "place", placeId: place.id } })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.fill },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.cardLeft}>
          <PlaceIconGlyph icon={place.icon} color={colors.accent} size={22} />
          <View style={styles.cardText}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{place.name}</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {t("places.routes_to", { count: routesCount })}
            </Text>
          </View>
        </View>
        <ChevronRightGlyph color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + space.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cabeçalho */}
            <View style={styles.header}>
              <View style={styles.headerTitles}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {t("places.title")}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {t("places.order_hint")}
                </Text>
              </View>
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

            {/* Lista de Atalhos */}
            {places.places.length === 0 ? (
              <Text style={[type.body, { color: colors.textSecondary, paddingVertical: space.md }]}>
                {t("places.empty")}
              </Text>
            ) : (
              <View style={styles.list}>
                {shortcuts.map((p, idx) => {
                  const routesCount = places.routes.filter(
                    (r) =>
                      r.destinationPlaceId === p.id &&
                      r.deletedAt === null &&
                      places.options.some((o) => o.routeId === r.id && o.deletedAt === null),
                  ).length;
                  return (
                    <ShortcutCardItem
                      key={p.id}
                      place={p}
                      index={idx}
                      total={shortcuts.length}
                      routesCount={routesCount}
                      onReorder={handleReorder}
                      onPress={() => dispatch({ type: "push", sheet: { kind: "place", placeId: p.id } })}
                    />
                  );
                })}
                {nonShortcuts.map((p) => renderNonShortcutCard(p))}
              </View>
            )}

            {/* Botão Novo lugar */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("places.new")}
              onPress={() => dispatch({ type: "push", sheet: { kind: "place" } })}
              style={[styles.newButton, { backgroundColor: colors.fill }]}
            >
              <PlusGlyph color={colors.text} />
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("places.new")}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </View>
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  headerTitles: {
    flex: 1,
    gap: 4,
    paddingRight: space.sm,
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
  list: {
    gap: space.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flex: 1,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  dragHandleHitTarget: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
