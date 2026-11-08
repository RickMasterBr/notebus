/** Moldura de uma folha dentro de tela nativa: uma altura só (99,99%), sem arrastar para fechar e sem fundo escurecido. Só monta a folha após medir a altura da tela [hipótese, só o aparelho decide]. */
import BottomSheet from "@gorhom/bottom-sheet";
import { useFocusEffect } from "@react-navigation/native";
import { type ComponentType, type ElementRef, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DIAG_SCROLL, recordDiagEvent } from "../sheets/diagScroll";
import { useCloseSheet } from "../sheets/StackedSheet";
import { useTheme } from "../theme";
import { type FrameLayoutState, frameLayoutState, heightChanged } from "./frameLayout";

// A biblioteca ignora a posição 0 (setToPosition sai em if (!targetPosition)), então "100%" deixaria a folha fora da tela;
// "99.99%" dá posição positiva imperceptível (cerca de 0,08 px em tela típica).
const ALT = "99.98%";
const FULL = ["99.99%"];

export function ScreenSheetFrame({ Handle, children }: { Handle?: ComponentType<{ onClose: () => void }>; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [frameHeight, setFrameHeight] = useState(0);

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.surface }]}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.height;
        setFrameHeight((previous) => {
          if (heightChanged(previous, next)) {
            if (DIAG_SCROLL) recordDiagEvent(`moldura layout h=${Math.round(next)} top=${Math.round(insets.top)}`);
            return next;
          }
          return previous;
        });
      }}
    >
      {frameLayoutState(frameHeight, insets.top) !== null ? (
        <MeasuredFrame frameHeight={frameHeight} Handle={Handle}>
          {children}
        </MeasuredFrame>
      ) : null}
    </View>
  );
}

function MeasuredFrame({
  frameHeight,
  Handle,
  children,
}: {
  frameHeight: number;
  Handle?: ComponentType<{ onClose: () => void }>;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const close = useCloseSheet();
  const layoutState = useSharedValue<FrameLayoutState>(frameLayoutState(frameHeight, insets.top) as FrameLayoutState);
  const diagPos = useSharedValue(-1);
  const contentRef = useRef<View>(null);
  const sheetRef = useRef<ElementRef<typeof BottomSheet>>(null);
  const seenFocus = useRef(false);
  const flip = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (seenFocus.current) {
        const reafirma = (registrar: boolean) => {
          flip.current = !flip.current;
          const alvo = flip.current ? ALT : FULL[0]!;
          if (registrar && DIAG_SCROLL) recordDiagEvent(`moldura reafirma p=${alvo}`);
          sheetRef.current?.snapToPosition(alvo, { duration: 0 });
        };
        reafirma(true);
        const t = setTimeout(() => reafirma(false), 450);
        return () => clearTimeout(t);
      }
      seenFocus.current = true;
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (!DIAG_SCROLL) return;
      recordDiagEvent(`moldura foco pos=${Math.round(diagPos.get())} cl=${Math.round(layoutState.get().height)}`);
      const t = setTimeout(() => {
        recordDiagEvent(
          `moldura foco600ms pos=${Math.round(diagPos.get())} cl=${Math.round(layoutState.get().height)}`,
        );
      }, 600);
      return () => clearTimeout(t);
    }, [diagPos, layoutState]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!DIAG_SCROLL) return;
      const med = (rotulo: string) => {
        contentRef.current?.measureInWindow((x, y, w, h) => {
          recordDiagEvent(
            `${rotulo} x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(w)} h=${Math.round(h)}${w === 0 || h === 0 ? " ZERO" : ""}`,
          );
        });
      };
      med("med0");
      const t150 = setTimeout(() => med("med150"), 150);
      const t600 = setTimeout(() => med("med600"), 600);
      return () => {
        clearTimeout(t150);
        clearTimeout(t600);
      };
    }, []),
  );

  useEffect(() => {
    if (!DIAG_SCROLL) return;
    recordDiagEvent(`moldura montou cl=${Math.round(layoutState.get().height)}`);
    const t150 = setTimeout(() => {
      recordDiagEvent(
        `moldura 150ms pos=${Math.round(diagPos.get())} cl=${Math.round(layoutState.get().height)}`,
      );
    }, 150);
    const t600 = setTimeout(() => {
      recordDiagEvent(
        `moldura 600ms pos=${Math.round(diagPos.get())} cl=${Math.round(layoutState.get().height)}`,
      );
    }, 600);
    return () => {
      clearTimeout(t150);
      clearTimeout(t600);
    };
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      accessible={false}
      accessibilityRole={null}
      accessibilityLabel={null}
      index={0}
      snapPoints={FULL}
      enableDynamicSizing={false}
      animateOnMount={false}
      enablePanDownToClose={false}
      enableHandlePanningGesture={false}
      enableContentPanningGesture={false}
      topInset={insets.top}
      containerLayoutState={layoutState}
      animatedPosition={DIAG_SCROLL ? diagPos : undefined}
      onChange={DIAG_SCROLL ? (index: number, position: number) => recordDiagEvent(`moldura onChange i=${index} pos=${Math.round(position)}`) : undefined}
      handleComponent={Handle ? () => <Handle onClose={close} /> : null}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <View
        ref={contentRef}
        collapsable={false}
        style={[styles.fill, { paddingHorizontal: 16, paddingBottom: insets.bottom }]}
        onLayout={DIAG_SCROLL ? (e) => recordDiagEvent(`moldura conteudo h=${Math.round(e.nativeEvent.layout.height)} w=${Math.round(e.nativeEvent.layout.width)}`) : undefined}
      >
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
