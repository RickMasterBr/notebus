/**
 * Regra pura de remontagem quando o fontScale do sistema aumenta (E-09 Bloco 4, FN-3).
 * Sem React, sem relógio.
 */

export const FONT_SCALE_EPSILON = 0.001;
const FLOAT_TOLERANCE = 1e-7;

/**
 * Calcula a próxima chave de remontagem com base na mudança de fontScale.
 * - Só aumento (nextScale - prevScale >= 0.001) altera a chave, incrementando-a.
 * - Diminuir ou ficar igual (diferença menor que 0.001) não remonta, mantendo currentKey.
 */
export function nextFontScaleKey(
  prevScale: number,
  nextScale: number,
  currentKey: number,
): number {
  if (nextScale - prevScale >= FONT_SCALE_EPSILON - FLOAT_TOLERANCE) {
    return currentKey + 1;
  }
  return currentKey;
}
