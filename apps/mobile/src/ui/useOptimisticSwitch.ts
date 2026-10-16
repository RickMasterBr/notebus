import { useCallback, useRef, useState } from "react";
import { createCommitQueue } from "../data/commitQueue";
import { nextSwitchValue, optimisticIdle, requestValue, settle, shownValue } from "../data/switchOptimistic";
import { DIAG_SCROLL, recordDiagEvent } from "../sheets/diagScroll";

/** Interruptor que mostra o toque na hora e grava por trás (FN-6, FN-23). `commit` resolve quando o valor gravado já foi relido. */
export function useOptimisticSwitch(
  saved: boolean,
  commit: (value: boolean) => Promise<unknown>,
  label?: string,
) {
  const [state, setState] = useState(optimisticIdle);
  const ref = useRef(state);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const queue = useRef(
    createCommitQueue(async (value: boolean) => {
      if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} grava ${value}`);
      try {
        return await commitRef.current(value);
      } finally {
        if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} gravou ${value}`);
      }
    }),
  ).current;
  const apply = (next: typeof state) => {
    ref.current = next;
    setState(next);
  };
  const onValueChange = useCallback(
    (eventValue: boolean) => {
      const shownBefore = shownValue(saved, ref.current);
      if (DIAG_SCROLL && label) {
        recordDiagEvent(`sw ${label} toque ${eventValue} mostrado=${shownBefore}`);
      }
      const nextValue = nextSwitchValue(saved, ref.current);
      const next = requestValue(ref.current, nextValue);
      apply(next);
      void (async () => {
        try {
          await queue.enqueue(nextValue);
        } catch {
          // falha: o finally devolve o valor gravado (o antigo)
        } finally {
          apply(settle(ref.current, next.seq));
          if (DIAG_SCROLL && label) {
            recordDiagEvent(`sw ${label} fim mostra=${shownValue(saved, ref.current)} salvo=${saved}`);
          }
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, saved, label],
  );
  return { value: shownValue(saved, state), onValueChange };
}
