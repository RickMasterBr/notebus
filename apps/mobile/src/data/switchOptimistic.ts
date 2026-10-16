/**
 * Valor mostrado de um interruptor com gravação por trás (E-09 bloco 4b, FN-6).
 * O toque vale na hora (`pending`); quando a gravação termina, com sucesso ou falha,
 * o interruptor volta a mostrar o valor gravado (o novo, se gravou; o antigo, se falhou).
 */
export type OptimisticSwitch = { pending: boolean | null; seq: number };

export const optimisticIdle: OptimisticSwitch = { pending: null, seq: 0 };

export const shownValue = (saved: boolean, state: OptimisticSwitch): boolean => state.pending ?? saved;

/** Inverte o valor mostrado no instante do toque, ignorando o evento do switch (E-09 bloco 15, FN-23). */
export const nextSwitchValue = (saved: boolean, state: OptimisticSwitch): boolean => !shownValue(saved, state);

export const requestValue = (state: OptimisticSwitch, value: boolean): OptimisticSwitch => ({
  pending: value,
  seq: state.seq + 1,
});

/** Só o último pedido encerra o otimismo: um pedido duplicado antigo que termina não apaga o novo. */
export const settle = (state: OptimisticSwitch, seq: number): OptimisticSwitch =>
  seq === state.seq ? { pending: null, seq: state.seq } : state;
