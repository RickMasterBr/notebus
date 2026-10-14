/**
 * Reordenação pura de paragens no formulário de criação de linha (E-08.5 bloco 3, Item 1).
 * Sem dependências de React Native nem banco.
 */
import type { LineFormStop } from "./lineForm";

/**
 * Tira a paragem de `from` e a insere em `to`.
 * `from` ou `to` fora de `0..length-1`, ou `from === to`, devolve uma cópia igual (nova referência).
 */
export function moveStopTo(
  stops: readonly LineFormStop[],
  from: number,
  to: number,
): LineFormStop[] {
  if (from < 0 || from >= stops.length || to < 0 || to >= stops.length || from === to) {
    return [...stops];
  }
  const copy = [...stops];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/**
 * Calcula o índice de destino após arrastar com base no deslocamento vertical.
 * Usa piso de 40 na altura da linha para evitar divisão por valores ínfimos.
 */
export function dragTargetIndex(input: {
  index: number;
  translationY: number;
  rowHeight: number;
  total: number;
}): number {
  "worklet";
  const { index, translationY, rowHeight, total } = input;
  const delta = Math.round(translationY / Math.max(rowHeight, 40));
  return Math.min(Math.max(0, index + delta), total - 1);
}

/**
 * Calcula o deslocamento (-1, 0, 1 altura de linha) para uma linha durante o arrasto de outra.
 * index: índice da linha sendo avaliada.
 * from: índice da linha arrastada (-1 se nenhuma).
 * to: índice alvo do arrasto.
 */
export function rowShift(input: { index: number; from: number; to: number }): -1 | 0 | 1 {
  "worklet";
  const { index, from, to } = input;
  if (from === -1 || from === to || index === from) return 0;
  if (from < to) {
    if (index > from && index <= to) return -1;
    return 0;
  }
  if (index >= to && index < from) return 1;
  return 0;
}

/**
 * Resolve o índice alvo para ações de acessibilidade VoiceOver ("moveUp" / "moveDown").
 */
export function stopActionTarget(actionName: string, index: number): number | null {
  if (actionName === "moveUp") return index - 1;
  if (actionName === "moveDown") return index + 1;
  return null;
}
