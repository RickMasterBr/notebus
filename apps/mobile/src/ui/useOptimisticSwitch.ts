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
  const savedValue = saved; // o handler usa saved para o valor efetivo (guardas existentes fixam esse nome)
  const ref = useRef(state);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const queue = useRef(
    createCommitQueue(async (value: boolean) => {
      if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} grava ${value} salvo=${savedRef.current} t=${realNow() % 100000}`);
      try {
        return await commitRef.current(value);
      } finally {
        if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} gravou ${value} salvo=${savedRef.current} t=${realNow() % 100000}`);
      }
    }),
  ).current;
  // Valor gravado ATUAL: o log não pode usar o `saved` da closure do toque (E-09 bloco 20a, item 0).
  const savedRef = useRef(savedValue);
  savedRef.current = savedValue;
  const mountedRef = useRef(true);
  // Último valor pedido (E-09 bloco 20a, item 2): vale na janela entre o `saved` novo chegar e o render que o entrega
  // ao handler; sem ele o toque calcularia sobre o `saved` velho da closure e repetiria o valor antigo.
  const intentRef = useRef<boolean | null>(null);
  if (state.pending === null) intentRef.current = null;
  const apply = (next: typeof state) => {
    ref.current = next;
    if (next.pending !== null) intentRef.current = next.pending;
    setState(next);
  };
  if (DIAG_SCROLL && label) {
    recordDiagEvent(
      `sw ${label} render value=${shownValue(savedValue, state)} salvo=${savedValue} pendente=${state.pending} t=${realNow() % 100000}`,
    );
  }
  useEffect(() => {
    mountedRef.current = true;
    if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} monta t=${realNow() % 100000}`);
    return () => {
      mountedRef.current = false;
      if (DIAG_SCROLL && label) recordDiagEvent(`sw ${label} desmonta t=${realNow() % 100000}`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onValueChange = useCallback(
    (eventValue: boolean) => {
      const saved = intentRef.current ?? savedValue;
      const shownBefore = shownValue(saved, ref.current);
      if (DIAG_SCROLL && label) {
        recordDiagEvent(`sw ${label} toque evento=${eventValue} mostrado=${shownBefore} salvo=${savedRef.current} t=${realNow() % 100000}`);
      }
      const nextValue = nextSwitchValue(saved, ref.current);
      const next = requestValue(ref.current, nextValue);
      apply(next);
      void (async () => {
        try {
          await queue.enqueue(nextValue);
        } catch {
          // falha: o finally devolve o valor gravado (o antigo)
          if (next.seq === ref.current.seq) intentRef.current = null;
        } finally {
          apply(settle(ref.current, next.seq));
          if (DIAG_SCROLL && label) {
            recordDiagEvent(
              `sw ${label} fim mostra=${shownValue(savedRef.current, ref.current)} salvo=${savedRef.current} montado=${mountedRef.current} t=${realNow() % 100000}`,
            );
          }
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, savedValue, label],
  );
  return { value: shownValue(saved, state), onValueChange };
}
