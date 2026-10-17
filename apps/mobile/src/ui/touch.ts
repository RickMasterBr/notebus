import { minTouch } from "../theme/tokens";

/** Folga em volta de um controle menor que 44 pt para o toque chegar ao mínimo sem mudar o visual. */
export function hitSlopToMinTouch(size: number) {
  const slop = size >= minTouch ? 0 : Math.ceil((minTouch - size) / 2);
  return { top: slop, bottom: slop, left: slop, right: slop };
}
