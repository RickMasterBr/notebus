/**
 * Fila serializada de gravação para interruptores (E-09 Bloco 13, FN-23).
 * Garante que a segunda gravação só comece quando a primeira terminou (com sucesso ou falha),
 * de modo que o valor gravado e relido ao fim seja sempre o do último pedido.
 */
export interface CommitQueue<T> {
  enqueue(value: T): Promise<unknown>;
}

export function createCommitQueue<T>(commit: (value: T) => Promise<unknown>): CommitQueue<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue(value: T): Promise<unknown> {
      const run = tail.then(
        () => commit(value),
        () => commit(value),
      );
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
