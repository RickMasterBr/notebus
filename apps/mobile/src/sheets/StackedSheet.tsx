/**
 * Moldura das folhas empilhadas (4.4 §5.1, variante curta: 1 altura; 4.5 §2.5, D-043).
 * `tall`: uma altura fixa de 90% (folha com campo de texto e lista rolável, como a Busca); o teclado não empurra a folha.
 * Abre em 250 ms ease-out, fecha em 180 ms ease-in, e o fundo escurece (28% claro / 50% escuro).
 * Com "Reduzir movimento": sem deslocamento, só esmaece (150 ms).
 * `detents`: folha com mais de um detent (a do ponto, TL-02): mesmos `snapPoints` e handle próprios; a moldura (abrir,
 * fechar, fundo, pilha) é a mesma. O conteúdo é uma `View` que preenche a folha, como na `tall` (ver abaixo).
 */
import BottomSheet, { BottomSheetBackdrop, type BottomSheetBackdropProps, BottomSheetView } from "@gorhom/bottom-sheet";
import { type ComponentType, type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
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

export interface CloseSheetContextValue {
  close: () => void;
  register: (handler: () => void) => () => void;
}

const CloseSheetContext = createContext<CloseSheetContextValue | null>(null);

/** Fecha a folha com a animação de saída (o mesmo caminho do handle e do ✕): para o conteúdo fechar a própria folha. */
export function useCloseSheet(): () => void {
  const ctx = useContext(CloseSheetContext);
  return ctx ? ctx.close : () => {};
}

export function CloseSheetProvider({ id, children }: { id: number; children: ReactNode }) {
  const { dispatch } = useSheets();
  const handlerRef = useRef<() => void>(() => {
    dispatch({ type: "close", id });
  });

  const register = useCallback((handler: () => void) => {
    handlerRef.current = handler;
    return () => {
      handlerRef.current = () => dispatch({ type: "close", id });
    };
  }, [dispatch, id]);

  const close = useCallback(() => {
    handlerRef.current();
  }, []);

  const value = useMemo(() => ({ close, register }), [close, register]);

  return <CloseSheetContext.Provider value={value}>{children}</CloseSheetContext.Provider>;
}

export interface StackedDetents {
  /** Alturas da folha, da menor para a maior (números em px ou "50%"). */
  snapPoints: (string | number)[];
  /** Em que detent a folha abre (índice de `snapPoints`). */
  initialIndex: number;
  /** Handle da folha. Componente de identidade estável (um novo a cada troca de detent remonta o handle no fim do gesto). */
  Handle: ComponentType<{ onClose: () => void }>;
  /** A folha encaixou num detent (também por gesto do VoiceOver). Não é chamado ao fechar. */
  onChange?: (index: number) => void;
  /**
   * `false` desliga o gesto de arrastar a folha pelo conteúdo (Q-71, opção A): a biblioteca então deixa a lista sempre
   * destravada (`useScrollable`: `UNLOCKED`) e só o handle muda o detent. Omitido = padrão da biblioteca (liga).
   */
  enableContentPanningGesture?: boolean;
}

export function StackedSheet({
  id,
  children,
  tall = false,
  detents,
}: {
  id: number;
  children: ReactNode;
  tall?: boolean;
  detents?: StackedDetents;
}) {
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
      ref.current?.snapToIndex(detents?.initialIndex ?? 0, openConfig);
    }
  }, [isTop, detents?.initialIndex]);

  const closeFromHandle = useCallback(() => {
    // Sem movimento: sai direto e o `FadeOut` do invólucro faz o esmaecer. Com movimento: a folha desce e o `onClose` tira da pilha.
    if (reduceMotion) pop();
    else ref.current?.close(closeConfig);
  }, [pop, reduceMotion]);

  const closeCtx = useContext(CloseSheetContext);
  useEffect(() => {
    if (closeCtx) {
      return closeCtx.register(closeFromHandle);
    }
  }, [closeCtx, closeFromHandle]);

  const DetentsHandle = detents?.Handle;
  const Handle = useCallback(
    () => (DetentsHandle ? <DetentsHandle onClose={closeFromHandle} /> : <SheetHandle kind="close" onPress={closeFromHandle} />),
    [closeFromHandle, DetentsHandle],
  );
  const onChange = detents?.onChange;
  const handleChange = useCallback((index: number) => {
    if (index >= 0) onChange?.(index);
  }, [onChange]);
  const fill = tall || detents !== undefined;

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
        accessible={false}
        accessibilityRole={null}
        accessibilityLabel={null}
        index={detents?.initialIndex ?? 0}
        animateOnMount={!reduceMotion}
        animationConfigs={openConfig}
        snapPoints={detents ? detents.snapPoints : tall ? TALL_SNAP_POINTS : undefined}
        enableDynamicSizing={!fill}
        onChange={detents ? handleChange : undefined}
        keyboardBehavior={tall ? "extend" : undefined}
        enablePanDownToClose
        enableContentPanningGesture={detents?.enableContentPanningGesture}
        topInset={insets.top}
        onClose={pop}
        backdropComponent={renderBackdrop}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        {fill ? (
          // Folha alta com lista: `View` comum, não `BottomSheetView`. A `BottomSheetView` é absoluta e sem altura (a lista
          // dentro dela cresce até o fim do conteúdo e é cortada) e, ao montar depois da lista, troca o tipo de rolagem
          // registrado de "rolável" para "vista", e a folha passa a arrastar em vez de rolar.
          <View collapsable={false} style={[styles.content, styles.tall]}>{children}</View>
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
