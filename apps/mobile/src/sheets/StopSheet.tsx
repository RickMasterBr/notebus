/**
 * TL-02 Ponto (4.1 §5 e §11, 4.4 §5.1/§5.3/§5.8/§5.10/§5.12/§5.17, canvas da 4.5 Main.dc.html; plano E-02 §3 e §4.2).
 * Folha empilhada com 3 detents, ✕ Fechar (D-135), handle ajustável com rótulo e valor (D-129) e fundo escurecido.
 *
 * - **Pequeno:** o cartão de ponto do Início (`StopCardView`, o mesmo componente): nome, e por linha o próximo ônibus
 *   com o "esteja no ponto às". Altura medida na tela (handle + cartão), como o pequeno da folha inicial.
 * - **Médio:** chips de tipo de dia (hoje por padrão) e de linha, e a lista do dia agrupada por linha, o próximo em destaque.
 * - **Grande:** a mesma lista, com mais espaço. "Registrar aqui" (E-03), "Declarar horário" e "editar o ponto" (E-08)
 *   ficam de fora: botão que não faz nada é pior que botão ausente. Tocar num horário empilha a TL-05 (`AheadSheet`).
 *
 * Rolagem (Q-71, opção A): o gesto de arrastar a folha pelo conteúdo fica desligado (`enableContentPanningGesture`),
 * então a lista rola em qualquer detent; o detent muda pelo handle, e o ✕, o toque fora e o handle seguem fechando.
 *
 * Altura da lista (bloco 5b): `HiddenBelowSpacer` soma no fim o que a folha tem abaixo da borda da tela em cada detent
 * (a área de rolagem tem a altura do mais alto); o fim da lista para na borda da tela e lista curta não rola.
 *
 * Rolagem com os componentes da biblioteca (`BottomSheetScrollView`), numa `View` comum, não `BottomSheetView`
 * (ver `StackedSheet`). Dia sem serviço nunca é lista vazia: o porquê e o próximo dia (`DayLine.empty`).
 */
import { BottomSheetScrollView, useBottomSheet } from "@gorhom/bottom-sheet";
import type { DayTypeCode } from "@notebus/domain";
import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View, findNodeHandle, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSchedule } from "../data/ScheduleProvider";
import { type StopCard, buildStopCard } from "../data/stopCard";
import { type DayLine, type PassageRow, type StopDay, buildStopDay } from "../data/stopDay";
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
import { ScrollView as RNGHScrollView } from "react-native-gesture-handler";
import { DiagScrollPanel, useScrollVariant } from "./diagScroll";
import { HiddenBelowSpacer } from "./HiddenBelowSpacer";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, staticViewportHeight, stopContentHeight } from "./scrollInset";
import { type Detent, activeSheet } from "./stack";

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

  // TL-05: tocar num horário a empilha; ao fechá-la, o foco do VoiceOver volta para a linha tocada (4.6 §5, bloco 5a).
  const { state, dispatch } = useSheets();
  const isTop = activeSheet(state).id === id;
  const rowRefs = useRef(new Map<string, View | null>());
  const openedRow = useRef<string | null>(null);
  const openAhead = useCallback(
    (row: PassageRow) => {
      openedRow.current = row.key;
      dispatch({ type: "push", sheet: { kind: "ahead", tripId: row.tripId, position: row.position } });
    },
    [dispatch],
  );
  useEffect(() => {
    if (!isTop || openedRow.current === null) return;
    const key = openedRow.current;
    openedRow.current = null;
    // Espera a folha de cima sair e esta voltar a ser lida (ela estava escondida do VoiceOver).
    const timer = setTimeout(() => {
      const node = rowRefs.current.get(key);
      const tag = node ? findNodeHandle(node) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 400);
    return () => clearTimeout(timer);
  }, [isTop]);
  const setRowRef = useCallback((key: string, node: View | null) => {
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  }, []);

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
    () => ({ snapPoints: [small, "50%", "90%"], initialIndex: START_INDEX, Handle: StopHandle, onChange, enableContentPanningGesture: false }),
    [small, onChange],
  );
  const context = useMemo(() => ({ detent, setHandleHeight }), [detent]);

  const variant = useScrollVariant();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [contentOffsetY, setContentOffsetY] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // V5/V6: quando a folha termina de abrir (~300ms), remonta o ScrollView para obter o layout limpo já assentado
    const timer = setTimeout(() => {
      setSettled(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const visibleHeight = stopContentHeight(detent, window.height, insets.top, handleHeight, small);
  const containerH = containerHeightOf(window.height, insets.top);
  const currentSheetH =
    detent === 0
      ? small
      : detent === 1
      ? 0.5 * containerH
      : 0.9 * containerH;
  const staticHeight = staticViewportHeight(currentSheetH, handleHeight, 0, insets.bottom + space.md);
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  const showLines = (day?.lines ?? []).filter((l) => lineFilter === null || l.code === lineFilter);

  const listBody = (
    <View style={styles.body}>
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
              <LineSection key={line.code} line={line} onOpen={openAhead} setRowRef={setRowRef} />
            ))}
          </>
        ) : null}
      </View>
    </View>
  );

  const diagPanel = (
    <DiagScrollPanel
      sheetKind="stop"
      metrics={{
        detent,
        animatedPosition: 0,
        viewportHeight,
        contentHeight,
        spacerHeight: variant === "V0" ? 318.8 : 0,
        contentOffsetY,
        maxScrollOffset: maxOffset,
        activeChip: dayType ?? "hoje",
        scrollableStatus: "UNLOCKED",
      }}
    />
  );

  // Variante V3: detent único de 90% (tall), idêntico à Busca
  if (variant === "V3") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} tall>
          {diagPanel}
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => setContentHeight(h)}
            onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
          >
            {listBody}
          </BottomSheetScrollView>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V2: ScrollView do react-native-gesture-handler com altura visível restrita ao detent
  if (variant === "V2") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} detents={detents}>
          {diagPanel}
          <View style={{ height: visibleHeight }}>
            <RNGHScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
            >
              {listBody}
            </RNGHScrollView>
          </View>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V1: Hipótese principal (altura visível restrita ao detent ativo no BottomSheetScrollView, sem HiddenBelowSpacer)
  if (variant === "V1") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} detents={detents}>
          {diagPanel}
          <View style={{ height: visibleHeight }}>
            <BottomSheetScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
            >
              {listBody}
            </BottomSheetScrollView>
          </View>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V4: Altura do viewport da lista fixa e não animada calculada em JS (sem Reanimated layout pass)
  if (variant === "V4") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} detents={detents}>
          {diagPanel}
          <View style={{ height: staticHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
            >
              {listBody}
            </BottomSheetScrollView>
          </View>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V5: Remontar o ScrollView (key) uma vez quando a folha termina de abrir/assentar
  if (variant === "V5") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} detents={detents}>
          {diagPanel}
          <BottomSheetScrollView
            key={`stop-scroll-${settled ? "settled" : "init"}`}
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => setContentHeight(h)}
            onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
          >
            {listBody}
          </BottomSheetScrollView>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V6: V4 (Altura Estática JS) + V5 (Remontagem Key)
  if (variant === "V6") {
    return (
      <StopSheetContext.Provider value={context}>
        <StackedSheet id={id} detents={detents}>
          {diagPanel}
          <View style={{ height: staticHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              key={`stop-scroll-${settled ? "settled" : "init"}`}
              contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
            >
              {listBody}
            </BottomSheetScrollView>
          </View>
        </StackedSheet>
      </StopSheetContext.Provider>
    );
  }

  // Variante V0: Comportamento atual (controle, bloco 5b com HiddenBelowSpacer)
  return (
    <StopSheetContext.Provider value={context}>
      <StackedSheet id={id} detents={detents}>
        {diagPanel}
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.md }}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentHeight(h)}
          onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
        >
          {listBody}
          {/* Bloco 5b: a área de rolagem tem a altura do detent mais alto; este espaço cobre a parte abaixo da tela. */}
          <HiddenBelowSpacer snapPoints={detents.snapPoints} />
        </BottomSheetScrollView>
      </StackedSheet>
    </StopSheetContext.Provider>
  );
}

/** Um grupo da lista: selo, "→ destino" (e "(fim do percurso)"), e as passagens ou o porquê de não haver. */
function LineSection({
  line,
  onOpen,
  setRowRef,
}: {
  line: DayLine;
  onOpen: (row: PassageRow) => void;
  setRowRef: (key: string, node: View | null) => void;
}) {
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
            <PassageRowView
              key={row.key}
              line={line}
              row={row}
              last={i === line.rows.length - 1}
              onPress={() => onOpen(row)}
              rowRef={(node) => setRowRef(row.key, node)}
            />
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
  body: { gap: space.md },
  list: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  section: { gap: space.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  empty: { gap: 2, paddingVertical: space.xs },
  num: { fontVariant: ["tabular-nums"] },
});
