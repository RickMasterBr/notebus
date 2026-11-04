/**
 * Folha fechada pela biblioteca sem chamar `onClose` (arrastar até sair e soltar parado): índice <= -1 depois de
 * já ter aberto. Montagem com índice -1 antes de abrir não conta. Pura; o hook faz a confirmação por tempo.
 */

/** Maior que a abertura (250 ms) e que o `REVEAL_CHECK_MS` (350) do reparo, que remonta e passa por -1. */
export const CONFIRM_MS = 400;

export function closedWithoutNotice(input: { index: number; hasOpened: boolean }): boolean {
  return input.index <= -1 && input.hasOpened;
}
