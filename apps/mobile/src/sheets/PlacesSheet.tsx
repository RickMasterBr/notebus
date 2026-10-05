/**
 * TL-10 Lugares (D-063, A9; 4.6 §3.11).
 *
 * Lista de lugares e atalhos:
 * - Atalhos na ordem da tela inicial, com reordenação pura (reorder) e acessibilidade VoiceOver (Mover para cima/baixo).
 * - "Novo lugar" para cadastrar.
 * - Toque no lugar abre PlaceSheet.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlaces } from "../data/PlacesProvider";
import { reorder } from "../db/places";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph, CrossGlyph, DragHandleGlyph, PlaceIconGlyph, PlusGlyph } from "../ui/Glyphs";
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

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= shortcuts.length || toIndex < 0 || toIndex >= shortcuts.length) return;
    const ids = shortcuts.map((s) => s.id);
    const reorderedIds = reorder(ids, fromIndex, toIndex);
    await places.reorderShortcuts(reorderedIds);
  };

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const renderPlaceCard = (place: (typeof places.places)[0], index?: number, isShortcut = false) => {
    const routesCount = places.routes.filter(
      (r) => r.destinationPlaceId === place.id && r.deletedAt === null,
    ).length;

    const a11yActions = isShortcut
      ? [
          { name: "moveUp", label: t("places.reorder.up") },
          { name: "moveDown", label: t("places.reorder.down") },
        ]
      : undefined;

    return (
      <Pressable
        key={place.id}
        accessibilityRole="button"
        accessibilityLabel={`${place.name}, ${t("places.routes_to", { count: routesCount })}`}
        accessibilityActions={a11yActions}
        onAccessibilityAction={(event) => {
          if (index === undefined) return;
          if (event.nativeEvent.actionName === "moveUp" && index > 0) {
            void handleReorder(index, index - 1);
          } else if (event.nativeEvent.actionName === "moveDown" && index < shortcuts.length - 1) {
            void handleReorder(index, index + 1);
          }
        }}
        onPress={() => dispatch({ type: "push", sheet: { kind: "place", placeId: place.id } })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.fill },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.cardLeft}>
          {isShortcut ? <DragHandleGlyph color={colors.textSecondary} /> : null}
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
                {shortcuts.map((p, idx) => renderPlaceCard(p, idx, true))}
                {nonShortcuts.map((p) => renderPlaceCard(p, undefined, false))}
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
});
