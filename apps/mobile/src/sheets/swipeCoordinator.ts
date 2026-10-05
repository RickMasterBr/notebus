/**
 * Coordenação de gestos de deslize para listas com linhas Swipeable.
 * Garante que apenas uma linha permaneça aberta por vez.
 * Funções puras para facilitar testes unitários.
 */

export interface Closable {
  close: () => void;
}

/**
 * Fecha o Swipeable anterior se for diferente do novo e retorna o novo como aberto.
 */
export function openSingleSwipeable<T extends Closable>(
  current: T | null,
  next: T | null,
): T | null {
  if (current && current !== next) {
    current.close();
  }
  return next;
}

/**
 * Fecha o Swipeable aberto (se houver) e limpa a referência.
 */
export function closeAndClearSwipeable<T extends Closable>(current: T | null): null {
  if (current) {
    current.close();
  }
  return null;
}
