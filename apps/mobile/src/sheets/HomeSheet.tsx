/**
 * Folha inicial da TL-01 (4.4 §5.1, variante inicial): 3 detents.
 * Abre no médio se há recentes e no pequeno se não há (D-141, só na abertura a frio). Tocar fora no médio ou no grande
 * leva ao pequeno (D-145), sem repassar o toque e sem háptico.
 * Pequeno = só o handle e a pílula, medidos na tela (crescem com o Dynamic Type e nunca cortam), médio = 50%, grande = 90%.
 * Médio e grande mostram "Perto de você" (4.1 §4); o que a 4.1 lista para o grande (Trajetos, Registros recentes,
 * Rede e Ajustes) ainda não existe e não aparece.
 */
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
  useBottomSheet,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { initialDetent } from "../data/homeStart";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { SearchPill } from "../ui/SearchPill";
import {
  DiagScrollPanel,
  onResetScrollVariant,
  useScrollVariant,
  type DiagLayoutEvent,
  type DiagNativeScrollMetrics,
} from "./diagScroll";
import { HiddenBelowSpacer } from "./HiddenBelowSpacer";
import { NearbyStops } from "./NearbyStops";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { containerHeightOf, detentMetrics, staticViewportHeight } from "./scrollInset";
import { detentFromIndex } from "./stack";

const LAST_INDEX = 2;
/** Altura do detent pequeno até a primeira medida (handle + pílula + margem de baixo). */
const SMALL_FALLBACK = 120;

export function HomeSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const lastIndex = useRef<number | null>(null);
  const stops = useStopIndex();
  const schedule = useSchedule();
  const recent = useRecentStops();
  const listReady = stops.status !== "loading" && schedule.status !== "loading" && recent.status !== "loading";
  const [handleHeight, setHandleHeight] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  const small = handleHeight > 0 && pillHeight > 0 ? handleHeight + pillHeight + insets.bottom + space.md : SMALL_FALLBACK;
  const snapPoints = useMemo(() => [small, "50%", "90%"], [small]);
  // Com folha empilhada por cima, a de baixo sai da leitura do VoiceOver.
  const covered = state.stack.length > 1;
  const pill = useRef<View>(null);
  const wasCovered = useRef(false);
  // D-141: o detent da abertura a frio é decidido uma vez, quando os recentes chegam (leitura local, curta). Até lá a
  // folha não é montada, para não abrir pequena e saltar para o médio; depois, fica onde o Rick a deixou.
  const [startIndex, setStartIndex] = useState<number | null>(null);
  useEffect(() => {
    if (startIndex === null && recent.status === "ready") {
      const detent = initialDetent(recent.ids.length);
      setStartIndex(detent);
      dispatch({ type: "setDetent", detent });
    }
  }, [startIndex, recent.status, recent.ids.length, dispatch]);
  // O recolher por toque fora não é um encaixe por gesto: sem háptico (D-145, 4.5 §2.6).
  const skipHaptic = useRef(false);

  // Ao fechar a Busca (a base volta a ser a do topo), o foco do VoiceOver volta para a pílula que a abriu.
  useEffect(() => {
    if (wasCovered.current && !covered && pill.current) AccessibilityInfo.sendAccessibilityEvent(pill.current, "focus");
    wasCovered.current = covered;
  }, [covered]);

  const [homeSettledDetentKey, setHomeSettledDetentKey] = useState(0);
  const [homeSettledVisibleHeight, setHomeSettledVisibleHeight] = useState(0);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  const latestHomeWrapperHeightRef = useRef(0);
  const savedHomeOffsetRef = useRef(0);
  const homeScrollRef = useRef<any>(null);

  const mountTimeRef = useRef(performance.now());
  const orderRef = useRef(0);
  const [layoutEvents, setLayoutEvents] = useState<DiagLayoutEvent[]>([]);

  const addLayoutEvent = useCallback(
    (level: DiagLayoutEvent["level"], h?: number, y?: number, w?: number, extra?: string) => {
      const order = ++orderRef.current;
      const ms = Math.round(performance.now() - mountTimeRef.current);
      console.log(
        `[E02] #${order} +${ms}ms [${level}] h=${h !== undefined ? Math.round(h) : "-"} y=${y !== undefined ? Math.round(y) : "-"} ${extra ?? ""}`
      );
      setLayoutEvents((prev) => [
        ...prev.slice(-15),
        {
          order,
          ms,
          level,
          h: h !== undefined ? Math.round(h) : undefined,
          y: y !== undefined ? Math.round(y) : undefined,
          w: w !== undefined ? Math.round(w) : undefined,
          extra,
        },
      ]);
    },
    []
  );

  const scrollLiveRef = useRef<DiagNativeScrollMetrics>({
    layoutH: 0,
    contentH: 0,
    offsetY: 0,
    insetBottom: 0,
    onScrollCount: 0,
    beginDragCount: 0,
    endDragCount: 0,
  });
  const [displayedScrollMetrics, setDisplayedScrollMetrics] = useState<DiagNativeScrollMetrics>({
    ...scrollLiveRef.current,
  });

  useEffect(() => {
    const t = setInterval(() => {
      setDisplayedScrollMetrics({ ...scrollLiveRef.current });
    }, 100);
    return () => clearInterval(t);
  }, []);

  const [spacerMeasured, setSpacerMeasured] = useState(0);
  const [spacerAnimated, setSpacerAnimated] = useState(0);

  useEffect(() => {
    return onResetScrollVariant(() => {
      setViewportHeight(0);
      setContentHeight(0);
      setContentOffsetY(0);
      setBodyContentHeight(0);
      setSpacerMeasured(0);
      setSpacerAnimated(0);
      setLayoutEvents([]);
      scrollLiveRef.current = {
        layoutH: 0,
        contentH: 0,
        offsetY: 0,
        insetBottom: 0,
        onScrollCount: 0,
        beginDragCount: 0,
        endDragCount: 0,
      };
      setDisplayedScrollMetrics({ ...scrollLiveRef.current });
    });
  }, []);

  const handleScroll = useCallback((e: any) => {
    const ne = e.nativeEvent;
    const y = ne.contentOffset?.y ?? 0;
    setContentOffsetY(y);
    savedHomeOffsetRef.current = y;
    scrollLiveRef.current.layoutH = ne.layoutMeasurement?.height ?? 0;
    scrollLiveRef.current.contentH = ne.contentSize?.height ?? 0;
    scrollLiveRef.current.offsetY = y;
    scrollLiveRef.current.insetBottom = ne.contentInset?.bottom ?? 0;
    scrollLiveRef.current.onScrollCount++;
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    scrollLiveRef.current.beginDragCount++;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    scrollLiveRef.current.endDragCount++;
  }, []);

  const handleAnimate = useCallback(
    (fromIndex: number, toIndex: number) => {
      const ms = Math.round(performance.now() - mountTimeRef.current);
      scrollLiveRef.current.lastAnimate = { from: fromIndex, to: toIndex, ms };
      addLayoutEvent("animate", undefined, undefined, undefined, `${fromIndex}->${toIndex}`);
    },
    [addLayoutEvent]
  );

  const onChange = useCallback(
    (index: number) => {
      if (index < 0) return;
      const ms = Math.round(performance.now() - mountTimeRef.current);
      scrollLiveRef.current.lastChange = { index, ms };
      addLayoutEvent("change", undefined, undefined, undefined, `index=${index}`);
      // `selectionAsync` só quando o gesto encaixa num detent diferente (4.5 §2.6); a primeira leitura (abrir o app) não conta.
      const silent = skipHaptic.current;
      skipHaptic.current = false;
      if (!silent && lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
      lastIndex.current = index;
      dispatch({ type: "setDetent", detent: detentFromIndex(index) });

      // V7: remonta a cada detent assentado
      setHomeSettledDetentKey((k) => k + 1);

      // V8: atualiza a altura visível do wrapper só quando a gaveta assenta
      if (latestHomeWrapperHeightRef.current > 0) {
        setHomeSettledVisibleHeight(latestHomeWrapperHeightRef.current);
      }
    },
    [dispatch, addLayoutEvent],
  );

  // Identidade estável: um `handleComponent` novo a cada troca de detent remonta o handle no fim do gesto.
  const Handle = useCallback(() => <HomeHandle onHeight={setHandleHeight} />, []);

  // D-145: fundo transparente (não de opacidade 0) que só recebe o toque com a folha no médio ou no grande (no pequeno, `disappearsOnIndex`
  // o deixa passar). O toque recolhe a folha e não chega ao que está embaixo. Sem texto de leitura: não é um controle.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        // Opacidade 1 e fundo transparente: a vista com opacidade 0 não recebe toque no iOS (D-145, bloco 4).
        opacity={1}
        style={[props.style, { backgroundColor: "transparent" }]}
        pressBehavior={0}
        onPress={() => {
          skipHaptic.current = true;
        }}
        accessible={false}
        accessibilityRole={null}
        accessibilityLabel={null}
        accessibilityHint={null}
      />
    ),
    [],
  );

  const variant = useScrollVariant();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [contentOffsetY, setContentOffsetY] = useState(0);
  const [homeSettled, setHomeSettled] = useState(false);

  useEffect(() => {
    // V5/V6: remonta o ScrollView uma vez quando a folha termina de abrir/assentar (~300ms)
    const timer = setTimeout(() => {
      setHomeSettled(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // V7: restaura o offset após remontagem por detent
  useEffect(() => {
    if (variant === "V7" && homeScrollRef.current && savedHomeOffsetRef.current > 0) {
      const t = setTimeout(() => {
        homeScrollRef.current?.scrollTo?.({ y: savedHomeOffsetRef.current, animated: false });
      }, 16);
      return () => clearTimeout(t);
    }
  }, [homeSettledDetentKey, variant]);

  const window = useWindowDimensions();
  const containerH = containerHeightOf(window.height, insets.top);
  const currentHomeSheetH =
    state.detent === 0
      ? (small ?? 200)
      : state.detent === 1
      ? 0.5 * containerH
      : 0.9 * containerH;

  const staticHomeHeight = staticViewportHeight(
    currentHomeSheetH,
    handleHeight,
    pillHeight + space.md,
    insets.bottom + space.md,
  );

  // V9: lista com altura fixa = área da gaveta aberta (menos handle e pílula); o que fica abaixo da borda entra como respiro no fim.
  const v9Metrics = detentMetrics(snapPoints, containerH, handleHeight)[Math.min(state.detent, snapPoints.length - 1)];
  const v9Area = Math.max(80, Math.round((v9Metrics?.scrollAreaHeight ?? staticHomeHeight) - pillHeight - space.md));
  const v9Hidden = Math.max(0, Math.round(v9Metrics?.hidden ?? 0));

  if (startIndex === null) return null;

  const effectiveViewport = viewportHeight > 0 ? viewportHeight : (homeSettledVisibleHeight > 0 ? homeSettledVisibleHeight : staticHomeHeight);
  const effectiveContent = contentHeight > 0 ? contentHeight : bodyContentHeight;
  const maxOffset = Math.max(0, effectiveContent - effectiveViewport);

  const isStaticHeight = variant === "V4" || variant === "V6";
  const isKeySettled = variant === "V5" || variant === "V6";
  const isV7 = variant === "V7";
  const isV8 = variant === "V8";
  const isV9 = variant === "V9";
  const v8Height = homeSettledVisibleHeight > 0 ? homeSettledVisibleHeight : staticHomeHeight;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => addLayoutEvent("root", e.nativeEvent.layout.height, e.nativeEvent.layout.y, e.nativeEvent.layout.width)}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
    >
      <BottomSheet
        index={startIndex}
        animateOnMount={false}
        backdropComponent={renderBackdrop}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        topInset={insets.top}
        onChange={onChange}
        onAnimate={handleAnimate}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        {/* Painel de diagnóstico flutuante em overlay absoluto (sem ocupar altura no fluxo flexbox) */}
        <DiagScrollPanel
          sheetKind="home"
          metrics={{
            detent: state.detent,
            viewportHeight: effectiveViewport,
            contentHeight: effectiveContent,
            contentOffsetY,
            maxScrollOffset: maxOffset,
          }}
          nativeScroll={displayedScrollMetrics}
          geometry={{
            windowHeight: Math.round(window.height),
            topInset: Math.round(insets.top),
            bottomInset: Math.round(insets.bottom),
            containerHeight: Math.round(containerH),
            snapPoints,
          }}
          spacerMetrics={{
            measured: spacerMeasured,
            animated: spacerAnimated,
          }}
          events={layoutEvents}
        />
        {/* `View` comum, não `BottomSheetView`: ver `StackedSheet` (a lista perde a rolagem e o tamanho). */}
        <View
          style={styles.content}
          collapsable={false}
          onLayout={(e) => addLayoutEvent("content", e.nativeEvent.layout.height, e.nativeEvent.layout.y, e.nativeEvent.layout.width)}
        >
          <View collapsable={false} onLayout={(e) => setPillHeight(e.nativeEvent.layout.height)}>
            <SearchPill ref={pill} onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })} />
          </View>
          {/* No detent pequeno esta parte fica abaixo da borda da tela: fora da leitura do VoiceOver até a folha subir. */}
          <View
            collapsable={false}
            style={[
              styles.scroll,
              isStaticHeight ? { height: staticHomeHeight, flex: 0, overflow: "hidden" } : null,
              isV8 ? { height: v8Height, flex: 0, overflow: "hidden" } : null,
              isV9 ? { height: v9Area, flex: 0, overflow: "hidden" } : null,
            ]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              latestHomeWrapperHeightRef.current = h;
              if (homeSettledVisibleHeight === 0 && h > 0) {
                setHomeSettledVisibleHeight(h);
              }
              addLayoutEvent("wrapper", h, e.nativeEvent.layout.y, e.nativeEvent.layout.width);
            }}
            accessibilityElementsHidden={state.detent === 0}
            importantForAccessibility={state.detent === 0 ? "no-hide-descendants" : "auto"}
          >
            <BottomSheetScrollView
              ref={homeScrollRef}
              key={
                isV7
                  ? `home-scroll-v7-${listReady ? "ready" : "loading"}-${homeSettledDetentKey}`
                  : isKeySettled
                  ? `home-scroll-${listReady ? "ready" : "loading"}-${homeSettled ? "settled" : "init"}`
                  : listReady
                  ? "ready"
                  : "loading"
              }
              contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + space.md + (isV9 ? v9Hidden : 0) }}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0) setViewportHeight(h);
                addLayoutEvent("scrollView", h, e.nativeEvent.layout.y, e.nativeEvent.layout.width);
              }}
              onContentSizeChange={(_w, h) => {
                if (h > 0) setContentHeight(h);
                addLayoutEvent("contentSize", h, undefined, _w);
              }}
            >
              <View
                collapsable={false}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0) setBodyContentHeight(h);
                  addLayoutEvent("body", h, e.nativeEvent.layout.y, e.nativeEvent.layout.width);
                }}
              >
                <NearbyStops />
              </View>
              {/* Bloco 5b: em V0 (controle), o espaço do bloco 5b continua; em V1..V8 é desativado */}
              {variant === "V0" ? (
                <HiddenBelowSpacer
                  snapPoints={snapPoints}
                  onLayout={(e) => setSpacerMeasured(e.nativeEvent.layout.height)}
                  onAnimatedHeight={setSpacerAnimated}
                />
              ) : null}
            </BottomSheetScrollView>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: space.md },
  scroll: { flex: 1 },
});

/** Handle da folha inicial: o rótulo e o valor acompanham o detent; os ajustes do VoiceOver movem a folha. */
function HomeHandle({ onHeight }: { onHeight: (height: number) => void }) {
  const { state } = useSheets();
  const { snapToIndex } = useBottomSheet();
  return (
    <View collapsable={false} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="adjustable"
        detent={state.detent}
        onIncrement={() => snapToIndex(Math.min(state.detent + 1, LAST_INDEX))}
        onDecrement={() => snapToIndex(Math.max(state.detent - 1, 0))}
      />
    </View>
  );
}
