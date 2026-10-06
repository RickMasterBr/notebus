/**
 * TL-10 Opção (D-063, D-064, D-065; 4.6 §3.11).
 *
 * Editor de opção de ônibus ou a pé.
 * - Tipo ônibus ou a pé.
 * - Ônibus: linha, embarque (Busca em modo pick) e descida (AlightPicker).
 * - "A pé até o embarque" e "A pé depois da descida" com -/+ 1 min e faixa opcional.
 * - Tempo a pé compartilhado por par (D-069, D-087).
 * - "Confira: mudou a descida" quando a descida é alterada no rascunho.
 * - Prévia ao vivo pelo cálculo do gotoCards (D-064).
 * - Apagar opção com Desfazer no toast.
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { checkBusOption, gotoCards, lisbonWallClock } from "@notebus/domain";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { usePlaces } from "../data/PlacesProvider";
import type { RouteRow } from "../db/places";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useToast } from "../data/ToastProvider";
import { shouldCheckWalkAfterAlight } from "../data/alightSelection";
import { buildGotoInputFromSources } from "../data/gotoData";
import { hhmm } from "../data/testClockPicker";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, MinusGlyph, PlusGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { useAlightPick, useSheets, useStopPick } from "./SheetsContext";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function OptionHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: OptionHandle };

export function OptionSheet({
  id,
  routeId,
  optionId,
  originPlaceId: initialOriginPlaceId,
  destinationPlaceId: initialDestinationPlaceId,
}: {
  id: number;
  routeId?: string;
  optionId?: string;
  originPlaceId?: string;
  destinationPlaceId?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const now = useNow();
  const close = useCloseSheet();
  const { dispatch } = useSheets();
  const toast = useToast();
  const schedule = useSchedule();
  const registro = useRegistro();
  const places = usePlaces();
  const stopPick = useStopPick();
  const alightPick = useAlightPick();
  const [handleHeight, setHandleHeight] = useState(0);

  const route = useMemo(
    () => (routeId ? places.routes.find((r) => r.id === routeId && r.deletedAt === null) ?? null : null),
    [places.routes, routeId],
  );

  const effectiveOriginPlaceId = route?.originPlaceId ?? initialOriginPlaceId;
  const effectiveDestinationPlaceId = route?.destinationPlaceId ?? initialDestinationPlaceId;

  const existingOption = useMemo(
    () => (optionId ? places.options.find((o) => o.id === optionId && o.deletedAt === null) ?? null : null),
    [places.options, optionId],
  );

  const scheduleData = schedule.status === "ready" ? schedule.data : null;

  // Estado do rascunho
  const [kind, setKind] = useState<"bus" | "walk">(
    existingOption ? (existingOption.kind as "bus" | "walk") : "bus",
  );

  const [walkMinutes, setWalkMinutes] = useState<number>(
    existingOption?.walkMinutes ?? 15,
  );

  // Ônibus
  const existingBoardInfo = useMemo(() => {
    if (!existingOption?.boardPatternStopId || !scheduleData) return null;
    return scheduleData.patternStopById.get(existingOption.boardPatternStopId) ?? null;
  }, [existingOption, scheduleData]);

  const [selectedLineId, setSelectedLineId] = useState<string>(() => {
    if (existingBoardInfo && scheduleData) {
      return scheduleData.patternLineId.get(existingBoardInfo.patternId) ?? "";
    }
    if (scheduleData && scheduleData.lineInfo.size > 0) {
      return Array.from(scheduleData.lineInfo.keys())[0]!;
    }
    return "";
  });

  const [patternId, setPatternId] = useState<string>(() => {
    if (existingBoardInfo) return existingBoardInfo.patternId;
    if (scheduleData) {
      const match = scheduleData.patterns.find(
        (p) => scheduleData.patternLineId.get(p.id) === selectedLineId,
      );
      return match?.id ?? "";
    }
    return "";
  });

  const [boardPatternStopId, setBoardPatternStopId] = useState<string>(
    existingOption?.boardPatternStopId ?? "",
  );
  const [alightPatternStopId, setAlightPatternStopId] = useState<string>(
    existingOption?.alightPatternStopId ?? "",
  );

  // A descida mudou no rascunho? (D-065, T-48)
  const [alightChanged, setAlightChanged] = useState(false);
  const [walkFromEdited, setWalkFromEdited] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const showAlightCheck = useMemo(() => {
    return (
      alightChanged &&
      shouldCheckWalkAfterAlight({
        initialAlightPatternStopId: existingOption?.alightPatternStopId ?? "",
        currentAlightPatternStopId: alightPatternStopId,
        walkValueEdited: walkFromEdited,
        isSaved,
      })
    );
  }, [alightChanged, existingOption, alightPatternStopId, walkFromEdited, isSaved]);

  // Paragem de embarque
  const boardInfo = useMemo(() => {
    if (!boardPatternStopId || !scheduleData) return null;
    return scheduleData.patternStopById.get(boardPatternStopId) ?? null;
  }, [boardPatternStopId, scheduleData]);

  // Paragem de descida
  const alightInfo = useMemo(() => {
    if (!alightPatternStopId || !scheduleData) return null;
    return scheduleData.patternStopById.get(alightPatternStopId) ?? null;
  }, [alightPatternStopId, scheduleData]);

  // Tempos a pé compartilhados
  const initialWalkTo = useMemo(() => {
    if (!boardInfo || !effectiveOriginPlaceId) return { min: 0, max: null };
    const wt = places.getWalkTime(boardInfo.stopId, effectiveOriginPlaceId);
    return { min: wt?.minutesMin ?? 0, max: wt?.minutesMax ?? null };
  }, [boardInfo, effectiveOriginPlaceId, places]);

  const initialWalkFrom = useMemo(() => {
    if (!alightInfo || !effectiveDestinationPlaceId) return { min: 0, max: null };
    const wt = places.getWalkTime(alightInfo.stopId, effectiveDestinationPlaceId);
    return { min: wt?.minutesMin ?? 0, max: wt?.minutesMax ?? null };
  }, [alightInfo, effectiveDestinationPlaceId, places]);

  const [walkToMin, setWalkToMin] = useState(initialWalkTo.min);
  const [walkToMax, setWalkToMax] = useState<number | null>(initialWalkTo.max);

  const [walkFromMin, setWalkFromMin] = useState(initialWalkFrom.min);
  const [walkFromMax, setWalkFromMax] = useState<number | null>(initialWalkFrom.max);

  useEffect(() => {
    setWalkToMin(initialWalkTo.min);
    setWalkToMax(initialWalkTo.max);
  }, [initialWalkTo.min, initialWalkTo.max]);

  useEffect(() => {
    setWalkFromMin(initialWalkFrom.min);
    setWalkFromMax(initialWalkFrom.max);
  }, [initialWalkFrom.min, initialWalkFrom.max]);

  // Atualiza linha e primeiro padrão quando scheduleData carregar se vazio
  useEffect(() => {
    if (!selectedLineId && scheduleData && scheduleData.lineInfo.size > 0) {
      const firstLineId = Array.from(scheduleData.lineInfo.keys())[0]!;
      setSelectedLineId(firstLineId);
      const match = scheduleData.patterns.find(
        (p) => scheduleData.patternLineId.get(p.id) === firstLineId,
      );
      if (match) setPatternId(match.id);
    }
  }, [selectedLineId, scheduleData]);

  // Prévia ao vivo pelo gotoCards (D-064)
  const preview = useMemo(() => {
    if ((!route && (!effectiveOriginPlaceId || !effectiveDestinationPlaceId)) || !scheduleData) return null;

    const currentMs = now();

    const effectiveRoute: RouteRow = route ?? {
      id: "preview-route",
      originPlaceId: effectiveOriginPlaceId!,
      destinationPlaceId: effectiveDestinationPlaceId!,
      source: "user",
      createdAt: currentMs,
      updatedAt: currentMs,
      deletedAt: null,
    };

    // Constrói opção draft temporária
    const draftOpt = {
      id: existingOption?.id ?? "preview-option",
      routeId: effectiveRoute.id,
      kind,
      source: "user" as const,
      boardPatternStopId: kind === "bus" ? boardPatternStopId : null,
      alightPatternStopId: kind === "bus" ? alightPatternStopId : null,
      walkMinutes: kind === "walk" ? walkMinutes : null,
      sort: existingOption?.sort ?? 0,
      createdAt: currentMs,
      updatedAt: currentMs,
      deletedAt: null,
    };

    // Substitui walkTimes com valores locais do draft
    const updatedWalkTimes = [...places.walkTimes];
    if (boardInfo) {
      const idx = updatedWalkTimes.findIndex(
        (w) => w.stopId === boardInfo.stopId && w.placeId === effectiveOriginPlaceId,
      );
      const row = {
        id: "draft-wt-board",
        stopId: boardInfo.stopId,
        placeId: effectiveOriginPlaceId!,
        minutesMin: walkToMin,
        minutesMax: walkToMax,
        source: "user" as const,
        origin: "manual" as const,
        createdAt: currentMs,
        updatedAt: currentMs,
        deletedAt: null,
      };
      if (idx >= 0) updatedWalkTimes[idx] = row;
      else updatedWalkTimes.push(row);
    }
    if (alightInfo) {
      const idx = updatedWalkTimes.findIndex(
        (w) => w.stopId === alightInfo.stopId && w.placeId === effectiveDestinationPlaceId,
      );
      const row = {
        id: "draft-wt-alight",
        stopId: alightInfo.stopId,
        placeId: effectiveDestinationPlaceId!,
        minutesMin: walkFromMin,
        minutesMax: walkFromMax,
        source: "user" as const,
        origin: "manual" as const,
        createdAt: currentMs,
        updatedAt: currentMs,
        deletedAt: null,
      };
      if (idx >= 0) updatedWalkTimes[idx] = row;
      else updatedWalkTimes.push(row);
    }

    const gotoInput = buildGotoInputFromSources(
      {
        route: effectiveRoute,
        options: [draftOpt],
        walkTimes: updatedWalkTimes,
        observations: registro.observations,
        rides: registro.rides,
        schedule: scheduleData,
      },
      now(),
    );

    if (!gotoInput) return null;
    const cards = gotoCards(gotoInput);
    return cards[0] ?? null;
  }, [
    route,
    effectiveOriginPlaceId,
    effectiveDestinationPlaceId,
    scheduleData,
    existingOption,
    kind,
    selectedLineId,
    patternId,
    boardPatternStopId,
    alightPatternStopId,
    walkMinutes,
    boardInfo,
    alightInfo,
    walkToMin,
    walkToMax,
    walkFromMin,
    walkFromMax,
    places.walkTimes,
    registro.observations,
    registro.rides,
    now,
  ]);

  const handlePickBoarding = () => {
    stopPick.request((pickedStop) => {
      if (!scheduleData) return;
      // Procura um pattern da linha selecionada que contenha este stop
      const patternsForLine = scheduleData.patterns.filter(
        (p) => scheduleData.patternLineId.get(p.id) === selectedLineId,
      );
      for (const pat of patternsForLine) {
        const found = pat.stops.find((s) => s.stopId === pickedStop.id);
        if (found) {
          setPatternId(pat.id);
          const pStopId =
            scheduleData.patternStopIds.get(`${pat.id}:${found.position}`) ?? "";
          setBoardPatternStopId(pStopId);
          // Se descida anterior já não pertence ao mesmo percurso ou vem antes, reseta
          if (alightInfo && (alightInfo.patternId !== pat.id || alightInfo.position <= found.position)) {
            setAlightPatternStopId("");
          }
          return;
        }
      }
    });
    dispatch({ type: "push", sheet: { kind: "search", pick: true } });
  };

  const handlePickAlight = () => {
    if (!patternId || !boardInfo) return;
    alightPick.request((pickedAlight) => {
      setAlightPatternStopId(pickedAlight.patternStopId);
      setAlightChanged(true);
      setWalkFromEdited(false);
    });
    dispatch({
      type: "push",
      sheet: {
        kind: "alightPicker",
        routeId: route?.id ?? "",
        patternId,
        boardPosition: boardInfo.position,
        currentAlightPatternStopId: alightPatternStopId,
      },
    });
  };

  const handleSave = async () => {
    if (!effectiveOriginPlaceId || !effectiveDestinationPlaceId) return;

    if (kind === "bus") {
      if (!boardInfo || !alightInfo || !patternId) {
        toast.show({
          title: t("toast.save_failed.title"),
          body: t("toast.save_failed.body"),
        });
        return;
      }

      const pattern = scheduleData?.patterns.find((p) => p.id === patternId);
      if (!pattern) return;

      const check = checkBusOption(
        { patternId: boardInfo.patternId, position: boardInfo.position },
        { patternId: alightInfo.patternId, position: alightInfo.position },
      );
      if (check !== null) {
        toast.show({
          title: t("toast.save_failed.title"),
          body: check,
        });
        return;
      }

      // Grava tempos a pé compartilhados e a opção em transação atômica única
      await places.saveBusOption({
        routeId: route?.id,
        originPlaceId: effectiveOriginPlaceId,
        destinationPlaceId: effectiveDestinationPlaceId,
        optionId: existingOption?.id,
        boardStopId: boardInfo.stopId,
        walkToBoard: {
          minutesMin: walkToMin,
          minutesMax: walkToMax,
        },
        alightStopId: alightInfo.stopId,
        walkAfterAlight: {
          minutesMin: walkFromMin,
          minutesMax: walkFromMax,
        },
        boardPatternStopId,
        alightPatternStopId,
      });
    } else {
      // Walk option
      if (existingOption) {
        await places.updateOption(existingOption.id, {
          walkMinutes,
        });
      } else {
        await places.addOption({
          routeId: route?.id,
          originPlaceId: effectiveOriginPlaceId,
          destinationPlaceId: effectiveDestinationPlaceId,
          kind: "walk",
          walkMinutes,
        });
      }
    }

    setIsSaved(true);
    close();
  };

  const handleDelete = async () => {
    if (!existingOption) return;
    const { token } = await places.removeOption(existingOption.id);
    toast.show({
      title: t("toast.option_deleted.title"),
      action: {
        label: t("toast.action.undo"),
        run: () => places.restoreOption(token),
      },
    });
    close();
  };

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  if ((!route && (!effectiveOriginPlaceId || !effectiveDestinationPlaceId)) || !scheduleData) return null;

  const boardStopName = boardInfo
    ? scheduleData.stopNames.get(boardInfo.stopId) ?? boardInfo.stopId
    : "";
  const alightStopName = alightInfo
    ? scheduleData.stopNames.get(alightInfo.stopId) ?? alightInfo.stopId
    : "";

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
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("option.title")}
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

            {/* Alternador de Tipo: Ônibus / A pé */}
            <View role="radiogroup" aria-label={t("option.type.a11y")} style={styles.kindGroup}>
              <Pressable
                role="radio"
                aria-checked={kind === "bus"}
                accessibilityRole="button"
                onPress={() => setKind("bus")}
                style={[
                  styles.kindButton,
                  kind === "bus"
                    ? { backgroundColor: colors.accent }
                    : { backgroundColor: colors.fill },
                ]}
              >
                <Text
                  style={[
                    type.bodyStrong,
                    { color: kind === "bus" ? colors.onAccent : colors.text },
                  ]}
                >
                  {t("option.type.bus")}
                </Text>
              </Pressable>

              <Pressable
                role="radio"
                aria-checked={kind === "walk"}
                accessibilityRole="button"
                onPress={() => setKind("walk")}
                style={[
                  styles.kindButton,
                  kind === "walk"
                    ? { backgroundColor: colors.accent }
                    : { backgroundColor: colors.fill },
                ]}
              >
                <Text
                  style={[
                    type.bodyStrong,
                    { color: kind === "walk" ? colors.onAccent : colors.text },
                  ]}
                >
                  {t("common.walking")}
                </Text>
              </Pressable>
            </View>

            {kind === "bus" ? (
              <>
                {/* Linha */}
                <View style={styles.section}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("option.field.line")}
                  </Text>
                  <View style={styles.linesRow}>
                    {Array.from(scheduleData.lineInfo.entries()).map(([lId, lInfo]) => {
                      const isSelected = lId === selectedLineId;
                      return (
                        <Pressable
                          key={lId}
                          accessibilityRole="button"
                          accessibilityLabel={t("option.line.aria", { code: lInfo.code })}
                          onPress={() => {
                            setSelectedLineId(lId);
                            const pat = scheduleData.patterns.find(
                              (p) => scheduleData.patternLineId.get(p.id) === lId,
                            );
                            if (pat) setPatternId(pat.id);
                            setBoardPatternStopId("");
                            setAlightPatternStopId("");
                          }}
                          style={[
                            styles.lineOption,
                            isSelected && { borderColor: colors.accent, borderWidth: 2 },
                          ]}
                        >
                          <LineBadge code={lInfo.code} color={lInfo.color} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Embarque */}
                <View style={styles.section}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("option.field.boarding")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("option.field.boarding")}: ${boardStopName || t("option.pick_boarding.placeholder")}`}
                    onPress={handlePickBoarding}
                    style={[styles.pickerButton, { backgroundColor: colors.fill }]}
                  >
                    <Text
                      style={[
                        type.body,
                        { color: boardStopName ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {boardStopName || t("home.search_placeholder")}
                    </Text>
                  </Pressable>
                </View>

                {/* Descida */}
                <View style={styles.section}>
                  <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    {t("option.field.alight")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("option.field.alight")}: ${alightStopName || t("option.pick_alight.placeholder")}`}
                    disabled={!boardInfo}
                    onPress={handlePickAlight}
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.fill },
                      !boardInfo && { opacity: 0.5 },
                    ]}
                  >
                    <Text
                      style={[
                        type.body,
                        { color: alightStopName ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {alightStopName || t("alight_picker.title")}
                    </Text>
                  </Pressable>
                </View>

                {/* A pé até o embarque (D-100) */}
                <View style={styles.section}>
                  <View style={styles.walkHeaderRow}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("option.walk_to")}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (walkToMax === null) {
                          setWalkToMax(walkToMin);
                        } else {
                          setWalkToMax(null);
                        }
                      }}
                      style={[styles.rangeToggleBtn, { backgroundColor: colors.fill }]}
                    >
                      <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                        {walkToMax === null ? t("option.walk.range_button") : t("option.walk.no_range_button")}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("option.walk.minus.aria", {
                        target: t("option.walk_to"),
                      })}
                      onPress={() => setWalkToMin((m) => Math.max(0, m - 1))}
                      style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                    >
                      <MinusGlyph color={colors.text} />
                    </Pressable>
                    <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                      {walkToMax !== null ? `${walkToMin}–${walkToMax}\u00A0min` : `${walkToMin}\u00A0min`}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("option.walk.plus.aria", {
                        target: t("option.walk_to"),
                      })}
                      onPress={() => {
                        setWalkToMin((m) => {
                          const next = m + 1;
                          if (walkToMax !== null && next > walkToMax) {
                            setWalkToMax(next);
                          }
                          return next;
                        });
                      }}
                      style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                    >
                      <PlusGlyph color={colors.text} />
                    </Pressable>

                    {walkToMax !== null ? (
                      <View style={styles.maxStepperGroup}>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("option.walk.max_label")}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("option.walk.max_minus.aria", {
                            target: t("option.walk_to"),
                          })}
                          onPress={() => setWalkToMax((max) => (max !== null ? Math.max(walkToMin, max - 1) : walkToMin))}
                          style={[styles.stepperBtnSmall, { backgroundColor: colors.fill }]}
                        >
                          <MinusGlyph color={colors.text} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("option.walk.max_plus.aria", {
                            target: t("option.walk_to"),
                          })}
                          onPress={() => setWalkToMax((max) => (max !== null ? max + 1 : walkToMin + 1))}
                          style={[styles.stepperBtnSmall, { backgroundColor: colors.fill }]}
                        >
                          <PlusGlyph color={colors.text} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("option.walk.shared_hint")}
                  </Text>
                </View>

                {/* A pé depois da descida (D-100) */}
                <View style={styles.section}>
                  <View style={styles.walkHeaderRow}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("option.walk_from")}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setWalkFromEdited(true);
                        if (walkFromMax === null) {
                          setWalkFromMax(walkFromMin);
                        } else {
                          setWalkFromMax(null);
                        }
                      }}
                      style={[styles.rangeToggleBtn, { backgroundColor: colors.fill }]}
                    >
                      <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                        {walkFromMax === null ? t("option.walk.range_button") : t("option.walk.no_range_button")}
                      </Text>
                    </Pressable>
                  </View>
                  {showAlightCheck ? (
                    <Text style={[type.caption, { color: colors.warning, fontWeight: "600" }]}>
                      {t("option.walk.check")}
                    </Text>
                  ) : null}
                  <View style={styles.stepperRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("option.walk.minus.aria", {
                        target: t("option.walk_from"),
                      })}
                      onPress={() => {
                        setWalkFromMin((m) => Math.max(0, m - 1));
                        setWalkFromEdited(true);
                      }}
                      style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                    >
                      <MinusGlyph color={colors.text} />
                    </Pressable>
                    <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                      {walkFromMax !== null
                        ? `${walkFromMin}–${walkFromMax}\u00A0min`
                        : `${walkFromMin}\u00A0min`}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("option.walk.plus.aria", {
                        target: t("option.walk_from"),
                      })}
                      onPress={() => {
                        setWalkFromMin((m) => {
                          const next = m + 1;
                          if (walkFromMax !== null && next > walkFromMax) {
                            setWalkFromMax(next);
                          }
                          return next;
                        });
                        setWalkFromEdited(true);
                      }}
                      style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                    >
                      <PlusGlyph color={colors.text} />
                    </Pressable>

                    {walkFromMax !== null ? (
                      <View style={styles.maxStepperGroup}>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {t("option.walk.max_label")}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("option.walk.max_minus.aria", {
                            target: t("option.walk_from"),
                          })}
                          onPress={() => {
                            setWalkFromMax((max) => (max !== null ? Math.max(walkFromMin, max - 1) : walkFromMin));
                            setWalkFromEdited(true);
                          }}
                          style={[styles.stepperBtnSmall, { backgroundColor: colors.fill }]}
                        >
                          <MinusGlyph color={colors.text} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("option.walk.max_plus.aria", {
                            target: t("option.walk_from"),
                          })}
                          onPress={() => {
                            setWalkFromMax((max) => (max !== null ? max + 1 : walkFromMin + 1));
                            setWalkFromEdited(true);
                          }}
                          style={[styles.stepperBtnSmall, { backgroundColor: colors.fill }]}
                        >
                          <PlusGlyph color={colors.text} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {t("option.walk.shared_hint")}
                  </Text>
                </View>
              </>
            ) : (
              /* A pé */
              <View style={styles.section}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("option.walk_minutes")}
                </Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("option.walk.minus.aria", {
                      target: t("common.walking"),
                    })}
                    onPress={() => setWalkMinutes((m) => Math.max(1, m - 1))}
                    style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                  >
                    <MinusGlyph color={colors.text} />
                  </Pressable>
                  <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                    {`${walkMinutes}\u00A0min`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("option.walk.plus.aria", {
                      target: t("common.walking"),
                    })}
                    onPress={() => setWalkMinutes((m) => m + 1)}
                    style={[styles.stepperBtn, { backgroundColor: colors.fill }]}
                  >
                    <PlusGlyph color={colors.text} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Prévia ao vivo (D-064) */}
            {preview ? (
              <View style={[styles.previewCard, { backgroundColor: colors.fill }]}>
                <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                  {t("option.preview.title")}
                </Text>
                {preview.kind === "bus" ? (
                  <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                    {t("option.preview.detail", {
                      time: hhmm(preview.beAtStop),
                      time_arrive: hhmm(preview.arriveAt),
                    })}
                  </Text>
                ) : (
                  <Text style={[type.bodyStrong, styles.num, { color: colors.text }]}>
                    {t("route.option.walk_detail", {
                      leave: hhmm(preview.leaveAt),
                      arrive: hhmm(preview.arriveAt),
                    })}
                  </Text>
                )}
              </View>
            ) : null}

            {/* Ações: Salvar e Apagar */}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleSave}
                style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              >
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                  {t("common.save")}
                </Text>
              </Pressable>

              {existingOption ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleDelete}
                  style={[styles.deleteButton]}
                >
                  <Text style={[type.bodyStrong, { color: colors.danger }]}>
                    {t("option.delete")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
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
  kindGroup: {
    flexDirection: "row",
    gap: space.sm,
  },
  kindButton: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: space.xs,
  },
  walkHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeToggleBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    minHeight: 28,
    justifyContent: "center",
  },
  linesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  lineOption: {
    borderRadius: radius.sm,
    padding: 2,
  },
  pickerButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flexWrap: "wrap",
  },
  maxStepperGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: space.xs,
  },
  stepperBtn: {
    width: minTouch,
    height: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  num: {
    fontVariant: ["tabular-nums"],
  },
  previewCard: {
    padding: space.md,
    borderRadius: radius.md,
    gap: 4,
  },
  actions: {
    paddingTop: space.sm,
    gap: space.sm,
  },
  primaryButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
});
