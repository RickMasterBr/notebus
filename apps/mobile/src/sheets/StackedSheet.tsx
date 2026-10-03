/**
 * Moldura das folhas empilhadas (4.4 §5.1, variante curta: 1 altura; 4.5 §2.5, D-043).
 * `tall`: uma altura fixa de 90% (folha com campo de texto e lista rolável, como a Busca); o teclado não empurra a folha.
 * Abre em 250 ms ease-out, fecha em 180 ms ease-in, e o fundo escurece (28% claro / 50% escuro).
 * Com "Reduzir movimento": sem deslocamento, só esmaece (150 ms).
 */
import BottomSheet, { BottomSheetBackdrop, type BottomSheetBackdropProps, BottomSheetView } from "@gorhom/bottom-sheet";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { elevation, motion, radius, space, useTheme } from "../theme";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { activeSheet } from "./stack";
import { useReduceMotion } from "./useReduceMotion";

const OPEN_MS = motion.normal; // 250
const CLOSE_MS = 180;
const FADE_MS = motion.fast; // 150
const openConfig = { duration: OPEN_MS, easing: Easing.out(Easing.ease) };
const closeConfig = { duration: CLOSE_MS, easing: Easing.in(Easing.ease) };

const TALL_SNAP_POINTS = ["90%"];

export function StackedSheet({ id, children, tall = false }: { id: number; children: ReactNode; tall?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const isTop = activeSheet(state).id === id;
  const reduceMotion = useReduceMotion();
  const ref = useRef<BottomSheet>(null);
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;
  // A biblioteca avisou que a folha fechou enquanto havia outra por cima: a pilha não muda (a do topo é quem manda),
  // e a folha é aberta de novo quando voltar a ser a do topo. Assim a pilha e a tela não saem de sincronia.
  const closedWhileCovered = useRef(false);

  const pop = useCallback(() => {
    // Fechar por gesto, handle ou toque no fundo chega aqui; a pilha ignora avisos repetidos (fecha pelo id).
    if (!isTopRef.current) {
      closedWhileCovered.current = true;
      return;
    }
    dispatch({ type: "close", id });
  }, [dispatch, id]);

  useEffect(() => {
    if (isTop && closedWhileCovered.current) {
      closedWhileCovered.current = false;
      ref.current?.snapToIndex(0, openConfig);
    }
  }, [isTop]);

  const closeFromHandle = useCallback(() => {
    // Sem movimento: sai direto e o `FadeOut` do invólucro faz o esmaecer. Com movimento: a folha desce e o `onClose` tira da pilha.
    if (reduceMotion) pop();
    else ref.current?.close(closeConfig);
  }, [pop, reduceMotion]);

  const Handle = useCallback(
    () => <SheetHandle kind="close" onPress={closeFromHandle} />,
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
        snapPoints={tall ? TALL_SNAP_POINTS : undefined}
        enableDynamicSizing={!tall}
        keyboardBehavior={tall ? "extend" : undefined}
        enablePanDownToClose
        topInset={insets.top}
        onClose={pop}
        backdropComponent={renderBackdrop}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        {tall ? (
          // Folha alta com lista: `View` comum, não `BottomSheetView`. A `BottomSheetView` é absoluta e sem altura (a lista
          // dentro dela cresce até o fim do conteúdo e é cortada) e, ao montar depois da lista, troca o tipo de rolagem
          // registrado de "rolável" para "vista", e a folha passa a arrastar em vez de rolar.
          <View style={[styles.content, styles.tall]}>{children}</View>
        ) : (
          <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + space.md }]}>{children}</BottomSheetView>
        )}
      </BottomSheet>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md },
  tall: { flex: 1 },
});
