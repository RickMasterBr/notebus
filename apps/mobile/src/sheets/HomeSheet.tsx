/**
 * Folha inicial da TL-01 (4.4 §5.1, variante inicial): 3 detents.
 * Pequeno = altura do conteúdo (a biblioteca mede; cresce com o Dynamic Type e nunca corta), médio = 50%, grande = 90%.
 * Por ora o conteúdo é só a busca em pílula; o resto da TL-01 é do bloco 3b e das etapas seguintes.
 */
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { SearchPill } from "../ui/SearchPill";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { detentFromIndex } from "./stack";

const LAST_INDEX = 2;

export function HomeSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const ref = useRef<BottomSheet>(null);
  const lastIndex = useRef<number | null>(null);
  const snapPoints = useMemo(() => ["50%", "90%"], []);
  // Com folha empilhada por cima, a de baixo sai da leitura do VoiceOver.
  const covered = state.stack.length > 1;

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
      <SheetHandle
        kind="adjustable"
        onIncrement={() => ref.current?.snapToIndex(Math.min(state.detent + 1, LAST_INDEX))}
        onDecrement={() => ref.current?.snapToIndex(Math.max(state.detent - 1, 0))}
      />
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
        enableDynamicSizing
        enablePanDownToClose={false}
        topInset={insets.top}
        onChange={onChange}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + space.md }]}>
          <SearchPill onPress={() => dispatch({ type: "push", kind: "search" })} />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md },
});
