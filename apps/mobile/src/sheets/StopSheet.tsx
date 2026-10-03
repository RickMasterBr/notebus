/**
 * TL-02 Ponto (4.1 §5 e §11, 4.4 §5.1/§5.3/§5.8/§5.10/§5.12/§5.17, canvas da 4.5 Main.dc.html; plano E-02 §3 e §4.2).
 * Folha empilhada com 3 detents, ✕ Fechar (D-135), handle ajustável com rótulo e valor (D-129) e fundo escurecido.
 *
 * - **Pequeno:** o cartão de ponto do Início (`StopCardView`, o mesmo componente): nome, e por linha o próximo ônibus
 *   com o "esteja no ponto às". Altura medida na tela (handle + cartão), como o pequeno da folha inicial.
 * - **Médio:** chips de tipo de dia (hoje por padrão) e de linha, e a lista do dia agrupada por linha, o próximo em destaque.
 * - **Grande:** a mesma lista, com mais espaço. "Registrar aqui" (E-03), "Declarar horário" e "editar o ponto" (E-08)
 *   ficam de fora: botão que não faz nada é pior que botão ausente. Tocar num horário não faz nada (a TL-05 é do bloco 5).
 *
 * Rolagem com os componentes da biblioteca (`BottomSheetScrollView`), numa `View` comum, não `BottomSheetView`
 * (ver `StackedSheet`). Dia sem serviço nunca é lista vazia: o porquê e o próximo dia (`DayLine.empty`).
 */
import { BottomSheetScrollView, useBottomSheet } from "@gorhom/bottom-sheet";
import type { DayTypeCode } from "@notebus/domain";
import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSchedule } from "../data/ScheduleProvider";
import { type StopCard, buildStopCard } from "../data/stopCard";
import { type DayLine, type StopDay, buildStopDay } from "../data/stopDay";
import { dayTypeChipText, emptyTexts, lineHeaderText } from "../data/stopDayText";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { LineBadge } from "../ui/LineBadge";
import { PassageRowView } from "../ui/PassageRowView";
import { Skeleton } from "../ui/Skeleton";
import { StopCardView } from "../ui/StopCardView";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import type { Detent } from "./stack";

const DAY_TYPES: readonly DayTypeCode[] = ["weekday", "saturday", "sunday_holiday"];
/** Detent em que a folha abre. P-09 §1: o pequeno é a resposta imediata, sem rolar. */
const START_INDEX = 0;
const LAST_INDEX = 2;
/** Altura do detent pequeno até a primeira medida (handle + cartão com uma linha). */
const SMALL_FALLBACK = 220;
/** O pequeno nunca passa de 40% da tela (o médio é 50%): com muitas linhas ou texto grande, o cartão rola no médio. */
const SMALL_MAX_SHARE = 0.4;

/** O detent atual e a medida do handle, para o handle (renderizado pela biblioteca) sem trocar de identidade. */
const StopSheetContext = createContext<{ detent: Detent; setHandleHeight: (height: number) => void }>({
  detent: START_INDEX,
  setHandleHeight: () => {},
});

function StopHandle({ onClose }: { onClose: () => void }) {
  const { detent, setHandleHeight } = useContext(StopSheetContext);
  const { snapToIndex } = useBottomSheet();
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="adjustable"
        detent={detent}
        onIncrement={() => snapToIndex(Math.min(detent + 1, LAST_INDEX))}
        onDecrement={() => snapToIndex(Math.max(detent - 1, 0))}
        onClose={onClose}
      />
    </View>
  );
}

export function StopSheet({ id, stopId, name }: { id: number; stopId: string; name: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const schedule = useSchedule();
  const instant = useNowTick();

  const [detent, setDetent] = useState<Detent>(START_INDEX);
  const [handleHeight, setHandleHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);
  // `undefined` = hoje; um tipo de dia = o dia de serviço daquele tipo, com a época de hoje (§4.2).
  const [dayType, setDayType] = useState<DayTypeCode | undefined>(undefined);
  const [lineFilter, setLineFilter] = useState<string | null>(null);

  const loading = schedule.status === "loading";
  const skeleton = useSkeletonVisible(loading);

  const { card, day } = useMemo((): { card: StopCard | null; day: StopDay | null } => {
    if (schedule.status !== "ready") return { card: null, day: null };
    return {
      card: buildStopCard(stopId, schedule.data, instant),
      day: buildStopDay(stopId, schedule.data, instant, dayType),
    };
  }, [schedule, stopId, instant, dayType]);

  const lastIndex = useRef<number | null>(null);
  const onChange = useCallback((index: number) => {
    // `selectionAsync` quando a folha encaixa num detent diferente (4.5 §2.6); a abertura não conta.
    if (lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
    lastIndex.current = index;
    setDetent(index === 0 ? 0 : index === 1 ? 1 : 2);
  }, []);

  const small =
    handleHeight > 0 && cardHeight > 0
      ? Math.min(handleHeight + cardHeight + insets.bottom + space.md, window.height * SMALL_MAX_SHARE)
      : SMALL_FALLBACK;
  const detents = useMemo<StackedDetents>(
    () => ({ snapPoints: [small, "50%", "90%"], initialIndex: START_INDEX, Handle: StopHandle, onChange }),
    [small, onChange],
  );
  const context = useMemo(() => ({ detent, setHandleHeight }), [detent]);

  const showLines = (day?.lines ?? []).filter((l) => lineFilter === null || l.code === lineFilter);

  return (
    <StopSheetContext.Provider value={context}>
      <StackedSheet id={id} detents={detents}>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: space.md }}
          showsVerticalScrollIndicator={false}
        >
          <View collapsable={false} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
            {loading || skeleton ? (
              skeleton ? <Skeleton variant="card" /> : null
            ) : card ? (
              <StopCardView card={card} />
            ) : (
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {name}
              </Text>
            )}
          </View>

          {/* No detent pequeno esta parte fica abaixo da borda da tela: fora da leitura do VoiceOver até a folha subir. */}
          <View
            style={styles.list}
            accessibilityElementsHidden={detent === 0}
            importantForAccessibility={detent === 0 ? "no-hide-descendants" : "auto"}
          >
            {loading || skeleton ? (
              skeleton ? <Skeleton rows={3} /> : null
            ) : day ? (
              <>
                <View style={styles.chips}>
                  {DAY_TYPES.map((type_) => (
                    <Chip
                      key={type_}
                      label={dayTypeChipText(type_, type_ === day.todayType)}
                      selected={type_ === day.dayType}
                      onPress={() => setDayType(type_ === day.todayType ? undefined : type_)}
                    />
                  ))}
                </View>
                {day.lines.length > 1 ? (
                  <View style={styles.chips}>
                    <Chip
                      tone="ring"
                      label={t("terminal.filter.all_lines")}
                      selected={lineFilter === null}
                      onPress={() => setLineFilter(null)}
                    />
                    {day.lines.map((line) => (
                      <Chip
                        key={line.code}
                        tone="ring"
                        selected={lineFilter === line.code}
                        accessibilityLabel={t("terminal.filter.line_only.a11y", { line: line.code })}
                        onPress={() => setLineFilter(lineFilter === line.code ? null : line.code)}
                      >
                        <LineBadge code={line.code} color={line.color} />
                      </Chip>
                    ))}
                  </View>
                ) : null}
                {showLines.map((line) => (
                  <LineSection key={line.code} line={line} />
                ))}
              </>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </StackedSheet>
    </StopSheetContext.Provider>
  );
}

/** Um grupo da lista: selo, "→ destino" (e "(fim do percurso)"), e as passagens ou o porquê de não haver. */
function LineSection({ line }: { line: DayLine }) {
  const { colors } = useTheme();
  const header = lineHeaderText(line);
  const empty = line.empty ? emptyTexts(line.empty) : null;
  return (
    <View style={styles.section}>
      <View accessible accessibilityRole="header" accessibilityLabel={sectionA11y(line, header)} style={styles.sectionHeader}>
        <LineBadge code={line.code} color={line.color} />
        {header.direction ? <Text style={[type.bodyStrong, { color: colors.text }]}>{header.direction}</Text> : null}
        {header.end ? <Text style={[type.caption, { color: colors.textSecondary }]}>{header.end}</Text> : null}
      </View>
      {empty ? (
        <View style={styles.empty}>
          <Text style={[type.body, { color: colors.textSecondary }]}>{empty.reason}</Text>
          {empty.next ? <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{empty.next}</Text> : null}
        </View>
      ) : (
        <View>
          {line.rows.map((row, i) => (
            <PassageRowView key={row.key} line={line} row={row} last={i === line.rows.length - 1} />
          ))}
        </View>
      )}
    </View>
  );
}

function sectionA11y(line: DayLine, header: { direction: string | null; end: string | null }): string {
  return [
    t("common.line.a11y", { line: line.code }),
    ...(line.destination ? [t("home.stop_card.a11y.destination", { destination: line.destination })] : []),
    ...(header.end ? [t("sheet_stop.end_of_route")] : []),
  ].join(", ");
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  section: { gap: space.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  empty: { gap: 2, paddingVertical: space.xs },
  num: { fontVariant: ["tabular-nums"] },
});
