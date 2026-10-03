import { Easing, LinearTransition } from "react-native-reanimated";
import { useReduceMotion } from "../sheets/useReduceMotion";

/** Troca de ordem de cartões e linhas (D-142): ~200 ms, ease-out. */
const reorder = LinearTransition.duration(200).easing(Easing.out(Easing.ease));

/**
 * Transição de layout para o `layout` de um `Animated.View`; `undefined` com "Reduzir movimento" ligado (4.5 §2.5):
 * a ordem muda direto. Chame uma vez na lista e passe o valor a cada item.
 */
export function useReorderTransition() {
  return useReduceMotion() ? undefined : reorder;
}
