/**
 * Progresso, opacidade e altura da frase e de "Registros a conferir" conforme a folha da Início sobe ou desce
 * (E-09 bloco 4b, FN-8; bloco 5b, FN-15).
 * `sheetTop` é o topo da folha (mesmo sistema de `animatedPosition`); 0 no detent pequeno, 1 no médio, suavizado.
 */
export function homeFadeProgress(sheetTop: number, topAtSmall: number, topAtMedium: number): number {
  "worklet";
  const span = topAtSmall - topAtMedium;
  if (span <= 0) return 1;
  const p = Math.min(1, Math.max(0, (topAtSmall - sheetTop) / span));
  return p * p * (3 - 2 * p);
}

export function homeFadeOpacity(sheetTop: number, topAtSmall: number, topAtMedium: number): number {
  "worklet";
  return homeFadeProgress(sheetTop, topAtSmall, topAtMedium);
}

/** Altura do bloco: a medida (do conteúdo, nunca do contêiner animado) vezes o progresso; 0 no pequeno, inteira no médio. */
export function homeFadeHeight(progress: number, measuredHeight: number): number {
  "worklet";
  if (!(measuredHeight > 0)) return 0;
  return measuredHeight * Math.min(1, Math.max(0, progress));
}
