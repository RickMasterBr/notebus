import { useCallback, useEffect, useRef, useState } from "react";
import { realNow } from "../data/clock";
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
  // Valor gravado ATUAL: o log não pode usar o `saved` da closure do toque (E-09 bloco 20a, item 0).
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const mountedRef = useRef(true);
  const diag = (text: string) => {
    if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} ${text} t=${realNow() % 100000}`);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const diagRef = useRef(diag);
  diagRef.current = diag;
  const queue = useRef(
    createCommitQueue(async (value: boolean) => {
      diagRef.current(`grava ${value} salvo=${savedRef.current}`);
      try {
        return await commitRef.current(value);
      } finally {
        diagRef.current(`gravou ${value} salvo=${savedRef.current}`);
      }
    }),
  ).current;
  const apply = (next: typeof state) => {
    ref.current = next;
    setState(next);
  };
  const shown = shownValue(saved, state);
  diag(`render value=${shown} salvo=${saved} pendente=${state.pending}`);
  useEffect(() => {
    mountedRef.current = true;
    diagRef.current("monta");
    return () => {
      mountedRef.current = false;
      diagRef.current("desmonta");
    };
  }, []);
  const onValueChange = useCallback(
    (eventValue: boolean) => {
      const shownBefore = shownValue(savedRef.current, ref.current);
      diagRef.current(`toque evento=${eventValue} mostrado=${shownBefore} salvo=${savedRef.current}`);
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
          diagRef.current(
            `fim mostra=${shownValue(savedRef.current, ref.current)} salvo=${savedRef.current} montado=${mountedRef.current}`,
          );
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, saved, label],
  );
  return { value: shown, onValueChange };
}
