/**
 * Soltura da alça de arrasto de uma parada (E-09 bloco 4b, FN-9).
 * Depois de reordenar, a linha aparece no lugar novo; para a animação seguir de onde o dedo soltou,
 * ela parte do deslocamento do dedo menos o salto de posições que a reordenação já fez.
 */
export const DROP_SPRING = { damping: 20, stiffness: 200 } as const;

export function releaseStart(translationY: number, from: number, target: number, rowHeight: number): number {
  return translationY - (target - from) * rowHeight;
}
