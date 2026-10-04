/**
 * "Onde você desceu?" (4.6 §3.4; canvas `Main.dc.html`, folha "Onde você desceu?"; plano E-03 §4): as próximas paragens da
 * viagem em curso, a mais provável agora em primeiro (hora prevista com o atraso da própria viagem, D-070). Um toque numa
 * paragem grava a descida, fecha a folha e mostra o toast (Desfazer). Uma paragem que o percurso repete leva "2ª passagem".
 *
 * "Outra paragem" (4.6 `sheet_alight.other_stop`) fica de fora: o canvas desenha o botão, mas nenhum documento diz o que
 * ele abre; botão que não faz nada é pior que botão ausente. Detent único, lista na receita da D-150 (como a TL-05).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { type AlightRow, buildAlightRows } from "../data/rideView";
import { clockText } from "../data/stopCard";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { radius, space, type, useTheme } from "../theme";
import { lisbonWallClock } from "@notebus/domain";
import { LineBadge } from "../ui/LineBadge";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function AlightHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

/** Canvas: a folha tem 604 px num iPhone de 844 (≈ 72%). */
const DETENTS: StackedDetents = { snapPoints: ["72%"], initialIndex: 0, Handle: AlightHandle };

const ordinal = (n: number) => `${n}ª`;

export function AlightSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const index = useStopIndex();
  const { tripCard: card, status, alight } = useRegistro();
  const instant = useNowTick();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);
  const busy = useRef(false);

  // A viagem deixou de existir com a folha aberta (fechou pelo fim do percurso, foi desfeita): a folha não tem o que mostrar.
  useEffect(() => {
    if (status === "ready" && card === null && !busy.current) close();
  }, [status, card, close]);

  const data = schedule.status === "ready" ? schedule.data : null;
  const rows = useMemo(() => (data && card ? buildAlightRows(card, data, instant) : []), [data, card, instant]);
  const lastRowsRef = useRef<AlightRow[]>([]);
  if (rows.length > 0) {
    lastRowsRef.current = rows;
  }
  const lastCardRef = useRef<typeof card>(null);
  if (card) {
    lastCardRef.current = card;
  }
  const displayCard = card ?? (busy.current ? lastCardRef.current : null);
  const displayRows = rows.length > 0 ? rows : (busy.current ? lastRowsRef.current : []);

  const externalIds = useMemo(
    () => new Map(index.status === "ready" ? index.stops.map((s) => [s.id, s.externalId] as const) : []),
    [index],
  );

  const scrollAreaHeight = Math.max(
    80,
    Math.round(detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]?.scrollAreaHeight ?? 0),
  );

  const choose = async (row: AlightRow) => {
    if (!card || busy.current) return;
    busy.current = true;
    try {
      const ok = await alight(card, row);
      if (ok) {
        close();
      } else {
        busy.current = false;
      }
    } catch {
      busy.current = false;
    }
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {t("sheet_alight.title")}
              </Text>
              {displayCard ? (
                <View style={styles.ref}>
                  {displayCard.line ? <LineBadge code={displayCard.line.code} color={displayCard.line.color} /> : null}
                  <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>
                    {t("sheet_alight.trip_ref", {
                      board_time: displayCard.tripStart ?? displayCard.boardedTime,
                      now: clockText(lisbonWallClock(instant).minute),
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
            {displayRows.length > 0 ? (
              <>
                <Text style={[type.label, { color: colors.textSecondary }]}>{t("sheet_alight.sort_hint")}</Text>
                {displayRows.map((row, i) => (
                  <StopChoice key={row.position} row={row} highlighted={i === 0} externalId={externalIds.get(row.stopId) ?? null} onPress={() => void choose(row)} />
                ))}
              </>
            ) : (
              <Text style={[type.body, { color: colors.textSecondary }]}>{t("sheet_alight.no_stops")}</Text>
            )}
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

function StopChoice({
  row,
  highlighted,
  externalId,
  onPress,
}: {
  row: AlightRow;
  highlighted: boolean;
  externalId: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const time = row.approximate ? `~${row.time}` : row.time;
  const subtitle = externalId
    ? t("sheet_alight.stop.subtitle", { time, id: externalId })
    : t("sheet_alight.stop.subtitle_no_id", { time });
  const pass = row.number !== null ? t("sheet_alight.pass_ordinal", { ordinal: ordinal(row.number) }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[row.name, pass, subtitle].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        highlighted
          ? { backgroundColor: colors.highlight, borderColor: colors.accent, borderWidth: 1.5 }
          : { borderColor: colors.divider, borderWidth: 1 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[type.bodyStrong, { color: colors.text, fontWeight: highlighted ? "600" : "500" }]}>{row.name}</Text>
        <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      {pass ? (
        <View style={[styles.tag, { backgroundColor: colors.fill }]}>
          <Text style={[type.label, { color: colors.text }]}>{pass}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  ref: { flexDirection: "row", alignItems: "center", gap: 8 },
  // Canvas: altura mínima 58, raio 14, padding 8 12.
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  rowText: { flex: 1, gap: 2 },
  tag: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  num: { fontVariant: ["tabular-nums"] },
});
