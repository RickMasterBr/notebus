/**
 * Altura total do rodapé com aviso dinâmico ("Falta: ...") (E-08.5 bloco 3, Item 2).
 * Puro: sem dependências de React Native nem banco.
 */
export function footerTotalHeight(input: {
  base: number;
  noteHeight: number;
  noteVisible: boolean;
}): number {
  const { base, noteHeight, noteVisible } = input;
  if (!noteVisible) {
    return base;
  }
  const validNote = Number.isFinite(noteHeight) && noteHeight > 0 ? noteHeight : 0;
  return base + validNote;
}
