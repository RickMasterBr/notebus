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
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { initialDetent } from "../data/homeStart";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { SearchPill } from "../ui/SearchPill";
import { DiagScrollPanel, useScrollVariant } from "./diagScroll";
import { HiddenBelowSpacer } from "./HiddenBelowSpacer";
import { NearbyStops } from "./NearbyStops";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
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

  const onChange = useCallback(
    (index: number) => {
      if (index < 0) return;
      // `selectionAsync` só quando o gesto encaixa num detent diferente (4.5 §2.6); a primeira leitura (abrir o app) não conta.
      const silent = skipHaptic.current;
      skipHaptic.current = false;
      if (!silent && lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
      lastIndex.current = index;
      dispatch({ type: "setDetent", detent: detentFromIndex(index) });
    },
    [dispatch],
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

  if (startIndex === null) return null;

  const maxOffset = Math.max(0, contentHeight - viewportHeight);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
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
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        {/* `View` comum, não `BottomSheetView`: ver `StackedSheet` (a lista perde a rolagem e o tamanho). */}
        <View style={styles.content}>
          <DiagScrollPanel
            sheetKind="home"
            metrics={{
              detent: state.detent,
              animatedPosition: 0,
              viewportHeight,
              contentHeight,
              spacerHeight: variant === "V0" ? 319 : 0,
              contentOffsetY,
              maxScrollOffset: maxOffset,
            }}
          />
          <View collapsable={false} onLayout={(e) => setPillHeight(e.nativeEvent.layout.height)}>
            <SearchPill ref={pill} onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })} />
          </View>
          {/* No detent pequeno esta parte fica abaixo da borda da tela: fora da leitura do VoiceOver até a folha subir. */}
          <View
            style={styles.scroll}
            accessibilityElementsHidden={state.detent === 0}
            importantForAccessibility={state.detent === 0 ? "no-hide-descendants" : "auto"}
          >
            {/* `key`: quando o esqueleto dá lugar aos cartões, a lista é montada de novo e mede o conteúdo final (1ª abertura). */}
            <BottomSheetScrollView
              key={listReady ? "ready" : "loading"}
              contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onScroll={(e) => setContentOffsetY(e.nativeEvent.contentOffset.y)}
            >
              <NearbyStops />
              {/* Bloco 5b: em V0 (controle), o espaço do bloco 5b continua; em V1, V2 e V3 é desativado */}
              {variant === "V0" ? <HiddenBelowSpacer snapPoints={snapPoints} /> : null}
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
