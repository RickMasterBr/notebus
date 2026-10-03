/**
 * Espaço no fim da lista de uma folha com vários detents (E-02 bloco 5b; ver `scrollInset.ts`).
 * Tem a altura do que está abaixo da borda da tela e acompanha o topo da folha quadro a quadro (`animatedPosition`),
 * então o fim da lista para na borda da tela em qualquer detent, sem salto no arrasto do handle nem na troca por código.
 * Vai como último filho do `BottomSheetScrollView`, depois do conteúdo e antes do `paddingBottom` da área segura.
 */
import { useBottomSheet } from "@gorhom/bottom-sheet";
import { type LayoutChangeEvent, useWindowDimensions } from "react-native";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { containerHeightOf, hiddenBelow, highestPosition, type SnapPoint } from "./scrollInset";

export function HiddenBelowSpacer({
  snapPoints,
  onLayout,
  onAnimatedHeight,
}: {
  snapPoints: readonly SnapPoint[];
  onLayout?: (e: LayoutChangeEvent) => void;
  onAnimatedHeight?: (val: number) => void;
}) {
  const { animatedPosition } = useBottomSheet();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const highest = highestPosition(snapPoints, containerHeightOf(window.height, insets.top));
  const style = useAnimatedStyle(() => ({ height: hiddenBelow(animatedPosition.value, highest) }), [animatedPosition, highest]);

  useAnimatedReaction(
    () => hiddenBelow(animatedPosition.value, highest),
    (val, prev) => {
      if (onAnimatedHeight && (prev === null || Math.abs(val - prev) >= 1)) {
        runOnJS(onAnimatedHeight)(Math.round(val));
      }
    },
    [animatedPosition, highest, onAnimatedHeight]
  );

  return <Animated.View pointerEvents="none" style={style} onLayout={onLayout} />;
}

