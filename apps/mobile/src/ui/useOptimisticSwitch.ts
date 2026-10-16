import { useCallback, useRef, useState } from "react";
import { createCommitQueue } from "../data/commitQueue";
import { optimisticIdle, requestValue, settle, shownValue } from "../data/switchOptimistic";

/** Interruptor que mostra o toque na hora e grava por trás (FN-6, FN-23). `commit` resolve quando o valor gravado já foi relido. */
export function useOptimisticSwitch(saved: boolean, commit: (value: boolean) => Promise<unknown>) {
  const [state, setState] = useState(optimisticIdle);
  const ref = useRef(state);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const queue = useRef(createCommitQueue((value: boolean) => commitRef.current(value))).current;
  const apply = (next: typeof state) => {
    ref.current = next;
    setState(next);
  };
  const onValueChange = useCallback(
    (value: boolean) => {
      const next = requestValue(ref.current, value);
      apply(next);
      void (async () => {
        try {
          await queue.enqueue(value);
        } catch {
          // falha: o finally devolve o valor gravado (o antigo)
        } finally {
          apply(settle(ref.current, next.seq));
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue],
  );
  return { value: shownValue(saved, state), onValueChange };
}
