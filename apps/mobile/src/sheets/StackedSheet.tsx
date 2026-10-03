/**
 * Moldura das folhas empilhadas (4.4 §5.1, variante curta: 1 altura; 4.5 §2.5, D-043).
 * Abre em 250 ms ease-out, fecha em 180 ms ease-in, e o fundo escurece (28% claro / 50% escuro).
 * Com "Reduzir movimento": sem deslocamento, só esmaece (150 ms).
 */
import BottomSheet, { BottomSheetBackdrop, type BottomSheetBackdropProps, BottomSheetView } from "@gorhom/bottom-sheet";
import { type ReactNode, useCallback, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { elevation, motion, radius, space, useTheme } from "../theme";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { useReduceMotion } from "./useReduceMotion";

const OPEN_MS = motion.normal; // 250
const CLOSE_MS = 180;
const FADE_MS = motion.fast; // 150
const openConfig = { duration: OPEN_MS, easing: Easing.out(Easing.ease) };
const closeConfig = { duration: CLOSE_MS, easing: Easing.in(Easing.ease) };

export function StackedSheet({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { dispatch } = useSheets();
  const reduceMotion = useReduceMotion();
  const ref = useRef<BottomSheet>(null);
  const popped = useRef(false);

  const pop = useCallback(() => {
    // Fechar por gesto, handle ou toque no fundo chega aqui uma vez só.
    if (popped.current) return;
    popped.current = true;
    dispatch({ type: "pop" });
  }, [dispatch]);

  const closeFromHandle = useCallback(() => {
    // Sem movimento: sai direto e o `FadeOut` do invólucro faz o esmaecer. Com movimento: a folha desce e o `onClose` tira da pilha.
    if (reduceMotion) pop();
    else ref.current?.close(closeConfig);
  }, [pop, reduceMotion]);

  const Handle = useCallback(
    () => <SheetHandle kind="close" onPress={closeFromHandle} accessibilityLabel={t("common.close")} />,
    [closeFromHandle],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        // `opacity` 1 + cor já com alfa: 28% / 50% vêm do token `scrim`.
        opacity={1}
        style={[props.style, { backgroundColor: colors.scrim }]}
        accessibilityLabel={t("common.close")}
        accessibilityHint={undefined}
      />
    ),
    [colors.scrim],
  );

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityViewIsModal
      entering={reduceMotion ? FadeIn.duration(FADE_MS) : undefined}
      exiting={reduceMotion ? FadeOut.duration(FADE_MS) : undefined}
    >
      <BottomSheet
        ref={ref}
        index={0}
        animateOnMount={!reduceMotion}
        animationConfigs={openConfig}
        enableDynamicSizing
        enablePanDownToClose
        topInset={insets.top}
        onClose={pop}
        backdropComponent={renderBackdrop}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + space.md }]}>{children}</BottomSheetView>
      </BottomSheet>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md },
});
