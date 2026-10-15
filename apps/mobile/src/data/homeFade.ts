/**
 * Opacidade da frase e de "Registros a conferir" conforme a folha da Início sobe ou desce (E-09 bloco 4b, FN-8).
 * `sheetTop` é o topo da folha (mesmo sistema de `animatedPosition`); 0 no detent pequeno, 1 no médio, suavizado.
 */
export function homeFadeOpacity(sheetTop: number, topAtSmall: number, topAtMedium: number): number {
  "worklet";
  const span = topAtSmall - topAtMedium;
  if (span <= 0) return 1;
  const p = Math.min(1, Math.max(0, (topAtSmall - sheetTop) / span));
  return p * p * (3 - 2 * p);
}
