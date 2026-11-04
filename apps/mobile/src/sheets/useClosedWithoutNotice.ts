/**
 * A pilha segue a tela: se a biblioteca fechou a folha sem `onClose`, tira a folha da pilha depois de `CONFIRM_MS`
 * (o reparo do FN-14 remonta e o índice passa por -1 por um instante; isso não é fechamento).
 */
import { useCallback, useEffect, useRef } from "react";
import { type SharedValue, runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { CONFIRM_MS, closedWithoutNotice } from "./closedWithoutNotice";

export function useClosedWithoutNotice({
  animatedIndex,
  pop,
  resetKey,
}: {
  animatedIndex: SharedValue<number>;
  pop: () => void;
  resetKey: number;
}): void {
  const hasOpened = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const popRef = useRef(pop);
  popRef.current = pop;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => {
    hasOpened.current = false;
    cancel();
    return cancel;
  }, [resetKey, cancel]);

  const onIndex = useCallback(
    (index: number) => {
      if (index >= 0) {
        hasOpened.current = true;
        cancel();
        return;
      }
      if (timer.current !== undefined || !closedWithoutNotice({ index, hasOpened: hasOpened.current })) return;
      timer.current = setTimeout(() => {
        timer.current = undefined;
        // hasOpened volta a falso: não agenda de novo até o índice voltar a >= 0.
        if (closedWithoutNotice({ index: animatedIndex.value, hasOpened: hasOpened.current })) {
          hasOpened.current = false;
          popRef.current();
        }
      }, CONFIRM_MS);
    },
    [animatedIndex, cancel],
  );

  useAnimatedReaction(
    () => animatedIndex.value,
    (index) => {
      runOnJS(onIndex)(index);
    },
    [],
  );
}
