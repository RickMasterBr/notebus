/**
 * TL-10 Lugar (D-063, D-067, Q-97; 4.6 §3.11).
 *
 * Edição de lugar:
 * - Nome e Ícone (PlaceIconGlyph).
 * - Switch "Atalho na tela inicial" no estilo D-067.
 * - Localização: "Usar minha localização agora" com frase de motivo (D-031),
 *   lê coordenada nativa sem bloquear em caso de recusa.
 * - Seção "Trajetos até aqui" e "Novo trajeto até aqui".
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlaces } from "../data/PlacesProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { defaultPlaceIcon, resolveNewPlaceIconOnNameChange } from "../data/placeIcon";
import { checkPlaceLocation, getPlaceLocation, readNativeLocation } from "../data/placeLocation";
import { openGotoOrNewOption } from "../data/gotoNavigation";
import { originSelectionAction } from "./placeOrigin";
import { t } from "../i18n";
import { MapPicker } from "../screens/MapPicker";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, ChevronRightGlyph, PlaceIconGlyph, PlusGlyph } from "../ui/Glyphs";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { placeFooterHeight, placeSheetFrame } from "./placeFrame";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import type { SheetContent } from "./stack";

const HeightContext = createContext<(height: number) => void>(() => {});

function PlaceHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: PlaceHandle };

const AVAILABLE_ICONS = ["casa", "facul", "academia", "star", null] as const;

export function PlaceSheet({
  id,
  placeId,
  initialName,
}: {
  id: number;
  placeId?: string;
  initialName?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const places = usePlaces();
  const schedule = useSchedule();
  const [handleHeight, setHandleHeight] = useState(0);

  const existingPlace = useMemo(
    () => (placeId ? places.places.find((p) => p.id === placeId && p.deletedAt === null) ?? null : null),
    [places.places, placeId],
  );

  const [name, setName] = useState(existingPlace?.name ?? initialName ?? "");
  const [userPickedIcon, setUserPickedIcon] = useState(existingPlace !== null);
  const [icon, setIcon] = useState<string | null>(
    existingPlace?.icon ?? defaultPlaceIcon(initialName ?? ""),
  );
  const [isShortcut, setIsShortcut] = useState(existingPlace?.isShortcut ?? true);
  const [lat, setLat] = useState<number | null>(existingPlace?.lat ?? null);
  const [lon, setLon] = useState<number | null>(existingPlace?.lon ?? null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (existingPlace) {
      setName(existingPlace.name);
      setIcon(existingPlace.icon);
      setUserPickedIcon(true);
      setIsShortcut(existingPlace.isShortcut);
      setLat(existingPlace.lat);
      setLon(existingPlace.lon);
    }
  }, [existingPlace]);

  const handleNameChange = (newName: string) => {
    setName(newName);
    if (!existingPlace) {
      setIcon((current) => resolveNewPlaceIconOnNameChange(newName, current, userPickedIcon));
    }
  };

  // Trajetos que têm este lugar como destino (ignora trajetos sem opções ativas)
  const routesHere = useMemo(() => {
    if (!existingPlace) return [];
    return places.routes.filter(
      (r) =>
        r.destinationPlaceId === existingPlace.id &&
        r.deletedAt === null &&
        places.options.some((o) => o.routeId === r.id && o.deletedAt === null),
    );
  }, [places.routes, places.options, existingPlace]);

  // Outros lugares para criar novo trajeto até aqui
  const otherPlaces = useMemo(() => {
    return places.places.filter(
      (p) => (!existingPlace || p.id !== existingPlace.id) && p.deletedAt === null,
    );
  }, [places.places, existingPlace]);

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  const handleRequestLocation = async () => {
    setLocationStatus("requesting");
    setLocationNotice(null);
    const loc = await getPlaceLocation(readNativeLocation);
    const check = loc ? checkPlaceLocation(loc) : null;
    if (!loc || !check || check.kind === "invalid") {
      setLocationStatus("denied");
      return;
    }
    if (check.kind === "imprecise") {
      setLocationNotice(t("place.location.imprecise", { m: Math.round(check.accuracyM ?? 0) }));
      setLocationStatus("imprecise");
      return;
    }
    const keep = () => {
      setLat(loc.lat);
      setLon(loc.lon);
      setLocationStatus("set");
    };
    if (check.kind === "far") {
      setLocationStatus(null);
      Alert.alert(t("place.location.far"), undefined, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("stop.location_offer.save"), onPress: keep },
      ]);
      return;
    }
    keep();
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (existingPlace) {
      await places.updatePlace(existingPlace.id, {
        name: trimmed,
        icon,
        isShortcut,
        lat,
        lon,
      });
    } else {
      await places.createPlace({
        name: trimmed,
        icon,
        isShortcut,
        lat,
        lon,
      });
    }
    close();
  };

  const handleCreateRouteFrom = (originPlaceId: string) => {
    if (!existingPlace) return;
    setPickingOrigin(false);
    dispatch({
      type: "push",
      sheet: originSelectionAction(places.routes, originPlaceId, existingPlace.id),
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

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <View collapsable={false} style={{ height: listHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: space.lg },
              ]}
              showsVerticalScrollIndicator={false}
            >
            {/* Cabeçalho */}
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {existingPlace ? existingPlace.name : t("places.new")}
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

            {/* Campo Nome */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                {t("place.field.name")}
              </Text>
              <BottomSheetTextInput
                value={name}
                onChangeText={handleNameChange}
                placeholder={t("place.field.name")}
                placeholderTextColor={colors.textSecondary}
                style={[
                  type.body,
                  styles.textInput,
                  { backgroundColor: colors.fill, color: colors.text },
                ]}
              />
            </View>

            {/* Campo Ícone */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                {t("place.field.icon")}
              </Text>
              <View style={styles.iconSelectorRow}>
                {AVAILABLE_ICONS.map((ic) => {
                  const isSelected = icon === ic;
                  return (
                    <Pressable
                      key={ic ?? "default"}
                      accessibilityRole="button"
                      accessibilityLabel={t("place.icon.a11y", {
                        name: ic ? ic : t("place.icon.default"),
                      })}
                      onPress={() => {
                        setUserPickedIcon(true);
                        setIcon(ic);
                      }}
                      style={[
                        styles.iconButton,
                        { backgroundColor: colors.fill },
                        isSelected && { borderColor: colors.accent, borderWidth: 2 },
                      ]}
                    >
                      <PlaceIconGlyph
                        icon={ic}
                        color={isSelected ? colors.accent : colors.text}
                        size={22}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Switch Atalho na tela inicial (D-067) */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isShortcut }}
              onPress={() => setIsShortcut((s) => !s)}
              style={styles.switchRow}
            >
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {t("place.shortcut")}
              </Text>
              <View
                style={[
                  styles.switchTrack,
                  { backgroundColor: isShortcut ? colors.accent : colors.switchTrackOff },
                ]}
              >
                <View
                  style={[
                    styles.switchThumb,
                    {
                      backgroundColor: colors.surface,
                      transform: [{ translateX: isShortcut ? 20 : 0 }],
                    },
                  ]}
                />
              </View>
            </Pressable>

            {/* Seção Localização */}
            <View style={styles.section}>
              <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                {t("place.field.location")}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {locationNotice ?? (lat !== null && lon !== null ? t("place.location.set") : t("place.location.none"))}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("place.location.reason")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestLocation}
                style={[styles.locationButton, { backgroundColor: colors.fill }]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {t("place.location.use_now")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("map_pick.open.place.a11y")}
                onPress={() => setPickerOpen(true)}
                style={[styles.locationButton, { backgroundColor: colors.fill }]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {t("map_pick.open")}
                </Text>
              </Pressable>
            </View>

            {/* Trajetos até aqui (apenas se lugar já existe) */}
            {existingPlace ? (
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("place.routes_here")}
                </Text>
                {routesHere.length === 0 ? (
                  <Text style={[type.body, { color: colors.textSecondary }]}>
                    {t("place.no_routes")}
                  </Text>
                ) : (
                  <View style={styles.routesList}>
                    {routesHere.map((r) => {
                      const origin = places.places.find((p) => p.id === r.originPlaceId);
                      const originName = origin?.name ?? "";
                      const routeOpts = places.options.filter(
                        (o) => o.routeId === r.id && o.deletedAt === null,
                      );
                      const lineCodes = Array.from(
                        new Set(
                          routeOpts
                            .map((o) => {
                              if (!o.boardPatternStopId || !scheduleData) return null;
                              const bInfo = scheduleData.patternStopById.get(o.boardPatternStopId);
                              if (!bInfo) return null;
                              const lId = scheduleData.patternLineId.get(bInfo.patternId);
                              return lId ? scheduleData.lineInfo.get(lId)?.code : null;
                            })
                            .filter(Boolean),
                        ),
                      );

                      return (
                        <Pressable
                          key={r.id}
                          accessibilityRole="button"
                          onPress={() =>
                            dispatch({ type: "push", sheet: { kind: "route", routeId: r.id } })
                          }
                          style={[styles.routeRow, { backgroundColor: colors.fill }]}
                        >
                          <View style={styles.routeRowText}>
                            <Text style={[type.bodyStrong, { color: colors.text }]}>
                              {t("place.route.name", {
                                origin: originName,
                                destination: existingPlace.name,
                              })}
                            </Text>
                            <Text style={[type.caption, { color: colors.textSecondary }]}>
                              {t("place.route.summary", {
                                count: routeOpts.length,
                                line: lineCodes.join(", ") || "—",
                              })}
                            </Text>
                          </View>
                          <ChevronRightGlyph color={colors.textSecondary} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Novo trajeto até aqui */}
                {pickingOrigin ? (
                  <View style={styles.originPickerBox}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("place.new_route.origin_label")}
                    </Text>
                    {otherPlaces.map((op) => (
                      <Pressable
                        key={op.id}
                        accessibilityRole="button"
                        onPress={() => handleCreateRouteFrom(op.id)}
                        style={[styles.originOption, { backgroundColor: colors.fill }]}
                      >
                        <PlaceIconGlyph icon={op.icon} color={colors.text} size={18} />
                        <Text style={[type.body, { color: colors.text }]}>{op.name}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPickingOrigin(false)}
                      style={[styles.cancelOriginButton]}
                    >
                      <Text style={[type.caption, { color: colors.textSecondary }]}>
                        {t("common.cancel")}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  otherPlaces.length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPickingOrigin(true)}
                      style={[styles.newRouteButton, { backgroundColor: colors.fill }]}
                    >
                      <PlusGlyph color={colors.text} />
                      <Text style={[type.bodyStrong, { color: colors.text }]}>
                        {t("place.new_route")}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            ) : null}

            {/* Ação Ir para X (Item 3.4) */}
            {existingPlace ? (
              <View style={styles.gotoAction}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("sheet_goto.title", { destination: existingPlace.name })}
                  onPress={() => void openGotoOrNewOption(dispatch, places, existingPlace.id)}
                  style={[styles.gotoButton, { backgroundColor: colors.fill }]}
                >
                  <Text style={[type.bodyStrong, { color: colors.accent }]}>
                    {t("sheet_goto.title", { destination: existingPlace.name })}
                  </Text>
                </Pressable>
              </View>
            ) : null}

          </BottomSheetScrollView>
          </View>
          {/* Rodapé fixo com botão Salvar */}
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
              onPress={handleSave}
              style={[styles.saveButton, { backgroundColor: colors.accent }]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                {t("common.save")}
              </Text>
            </Pressable>
          </View>
        </View>
      </StackedSheet>
      <MapPicker
        visible={pickerOpen}
        existing={lat !== null && lon !== null ? { lat, lon } : null}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(p) => {
          setLat(p.lat);
          setLon(p.lon);
          setLocationNotice(null);
          setLocationStatus("set");
          setPickerOpen(false);
        }}
      />
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
  textInput: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  iconSelectorRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  iconButton: {
    width: minTouch,
    height: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTouch,
  },
  switchTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  locationButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  routesList: {
    gap: space.xs,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.md,
    borderRadius: radius.md,
  },
  routeRowText: {
    flex: 1,
    gap: 2,
  },
  originPickerBox: {
    padding: space.sm,
    gap: space.xs,
  },
  originOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    minHeight: minTouch,
    borderRadius: radius.md,
  },
  cancelOriginButton: {
    padding: space.xs,
    alignItems: "center",
  },
  newRouteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  footer: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gotoAction: {
    paddingTop: space.xs,
  },
  gotoButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
