/**
 * Medidas do quadro da folha de Lugar com rodapé fixo do Salvar (D-150, E-07 Bloco 9).
 * TypeScript puro, sem imports de React Native, testado no Node.
 */

/** Divide a altura da folha aberta (já descontado o handle) entre a lista e o rodapé do Salvar. */
export function placeSheetFrame(input: { scrollAreaHeight: number; footerHeight: number }): {
  listHeight: number;
  footerHeight: number;
} {
  return {
    listHeight: Math.max(80, input.scrollAreaHeight - input.footerHeight),
    footerHeight: input.footerHeight,
  };
}

/** Altura do rodapé: botão de alvo mínimo, respiro em cima e o respiro de baixo mais a área segura. */
export function placeFooterHeight(input: {
  minTouch: number;
  space: { sm: number; md: number };
  bottomInset: number;
}): number {
  return input.minTouch + input.space.sm + input.space.md + input.bottomInset;
}
