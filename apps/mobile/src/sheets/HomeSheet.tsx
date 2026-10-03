/**
 * Folha inicial da TL-01 (4.4 §5.1, variante inicial): 3 detents.
 * Pequeno = só o handle e a pílula, medidos na tela (crescem com o Dynamic Type e nunca cortam), médio = 50%, grande = 90%.
 * Médio e grande mostram "Perto de você" (4.1 §4); o que a 4.1 lista para o grande (Trajetos, Registros recentes,
 * Rede e Ajustes) ainda não existe e não aparece.
 */
import BottomSheet, { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { SearchPill } from "../ui/SearchPill";
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
  const ref = useRef<BottomSheet>(null);
  const lastIndex = useRef<number | null>(null);
  const [handleHeight, setHandleHeight] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  const small = handleHeight > 0 && pillHeight > 0 ? handleHeight + pillHeight + insets.bottom + space.md : SMALL_FALLBACK;
  const snapPoints = useMemo(() => [small, "50%", "90%"], [small]);
  // Com folha empilhada por cima, a de baixo sai da leitura do VoiceOver.
  const covered = state.stack.length > 1;
  const pill = useRef<View>(null);
  const wasCovered = useRef(false);

  // Ao fechar a Busca (a base volta a ser a do topo), o foco do VoiceOver volta para a pílula que a abriu.
  useEffect(() => {
    if (wasCovered.current && !covered && pill.current) AccessibilityInfo.sendAccessibilityEvent(pill.current, "focus");
    wasCovered.current = covered;
  }, [covered]);

  const onChange = useCallback(
    (index: number) => {
      if (index < 0) return;
      // `selectionAsync` só quando o gesto encaixa num detent diferente (4.5 §2.6); a primeira leitura (abrir o app) não conta.
      if (lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
      lastIndex.current = index;
      dispatch({ type: "setDetent", detent: detentFromIndex(index) });
    },
    [dispatch],
  );

  const Handle = useCallback(
    () => (
      <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
        <SheetHandle
          kind="adjustable"
          detent={state.detent}
          onIncrement={() => ref.current?.snapToIndex(Math.min(state.detent + 1, LAST_INDEX))}
          onDecrement={() => ref.current?.snapToIndex(Math.max(state.detent - 1, 0))}
        />
      </View>
    ),
    [state.detent],
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
    >
      <BottomSheet
        ref={ref}
        index={0}
        animateOnMount={false}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        topInset={insets.top}
        onChange={onChange}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        <BottomSheetView style={styles.content}>
          <View collapsable={false} onLayout={(e) => setPillHeight(e.nativeEvent.layout.height)}>
            <SearchPill ref={pill} onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })} />
          </View>
          {/* No detent pequeno esta parte fica abaixo da borda da tela: fora da leitura do VoiceOver até a folha subir. */}
          <View
            style={styles.scroll}
            accessibilityElementsHidden={state.detent === 0}
            importantForAccessibility={state.detent === 0 ? "no-hide-descendants" : "auto"}
          >
            <BottomSheetScrollView
              contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
            >
              <NearbyStops />
            </BottomSheetScrollView>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: space.md },
  scroll: { flex: 1 },
});
