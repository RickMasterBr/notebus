export type ToastDirection = "left" | "right" | "up";

export const EXIT_X = 400;
export const EXIT_Y = 120;

/** Margem superior do toast: o maior entre a area segura de cima mais 4 px e 12 px. */
export function toastTop(insetsTop: number): number {
  return Math.max(insetsTop + 4, 12);
}

/**
 * Direcao de dispensa por gesto de arrasto:
 * - Horizontal quando passa de 40 pt e a horizontal e a maior (ou empate).
 * - Cima ("up") quando passa de 20 pt para cima e a vertical e estritamente maior.
 * - null no resto (inclusive para baixo).
 */
export function toastDismissDirection(g: { dx: number; dy: number }): ToastDirection | null {
  const absDx = Math.abs(g.dx);
  const absDy = Math.abs(g.dy);
  if (absDx > 40 && absDx >= absDy) {
    return g.dx < 0 ? "left" : "right";
  }
  if (g.dy < -20 && absDy > absDx) {
    return "up";
  }
  return null;
}

/** Deslocamento de saida em x e y para cada direcao. */
export function toastExitOffset(direction: ToastDirection): { x: number; y: number } {
  if (direction === "left") {
    return { x: -EXIT_X, y: 0 };
  }
  if (direction === "right") {
    return { x: EXIT_X, y: 0 };
  }
  return { x: 0, y: -EXIT_Y };
}
