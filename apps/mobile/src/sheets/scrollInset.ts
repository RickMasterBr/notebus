/**
 * Altura da lista dentro de uma folha com vários detents (E-02 bloco 5b). TypeScript puro, testado no Node.
 *
 * Por que existe: a biblioteca dá à área de rolagem a altura da folha no detent **mais alto** (90%), em qualquer detent.
 * No médio (50%) os 40% de baixo da folha ficam para fora da tela, e a lista rola até o fim da área, não até o fim do que
 * se vê: a última linha fica cortada (ou, com lista curta, a lista cabe na parte escondida e "não rola").
 *
 * Exemplo (iPhone 797 pt de contêiner): no médio a folha tem 398 pt e a área de rolagem 673 pt; 319 pt dela estão abaixo
 * da borda da tela. Somar 319 pt de espaço no fim da lista faz o fim do conteúdo parar na borda da tela.
 */

export type SnapPoint = string | number;

/** O contêiner da biblioteca é a janela menos a área segura de cima (`topInset`). */
export function containerHeightOf(windowHeight: number, topInset: number): number {
  return Math.max(0, windowHeight - topInset);
}

/** Altura da folha num snap point, como a biblioteca a calcula: "50%" é parte do contêiner, número é px, nunca passa do contêiner. */
export function snapHeight(snapPoint: SnapPoint, containerHeight: number): number {
  const px = typeof snapPoint === "string" ? (Number(snapPoint.split("%")[0]) * containerHeight) / 100 : snapPoint;
  return Math.min(containerHeight, Math.max(0, px));
}

/** Posição do topo da folha no detent mais alto (o último de `snapPoints`), no mesmo sistema de `animatedPosition`. */
export function highestPosition(snapPoints: readonly SnapPoint[], containerHeight: number): number {
  const last = snapPoints[snapPoints.length - 1];
  return last === undefined ? containerHeight : containerHeight - snapHeight(last, containerHeight);
}

/**
 * Quanto do fim da área de rolagem está abaixo da borda da tela com o topo da folha em `position`.
 * No detent mais alto é 0; nos menores, a distância que a folha foi empurrada para baixo. Roda na thread da interface.
 */
export function hiddenBelow(position: number, highest: number): number {
  "worklet";
  return Math.max(0, position - highest);
}

export interface DetentMetrics {
  /** Altura da folha neste detent. */
  sheetHeight: number;
  /** Altura da área de rolagem: a mesma em todos os detents (altura do mais alto menos o handle). */
  scrollAreaHeight: number;
  /** Parte da área de rolagem que está na tela: a altura da folha neste detent menos o handle. */
  visibleHeight: number;
  /** `scrollAreaHeight - visibleHeight`: o que fica para fora da tela. É o espaço a somar no fim da lista. */
  hidden: number;
}

/** As medidas de cada detent. `handleHeight` é a altura medida do handle. */
export function detentMetrics(
  snapPoints: readonly SnapPoint[],
  containerHeight: number,
  handleHeight: number,
): DetentMetrics[] {
  const highest = snapPoints.length ? snapHeight(snapPoints[snapPoints.length - 1] as SnapPoint, containerHeight) : 0;
  const scrollAreaHeight = Math.max(0, highest - handleHeight);
  return snapPoints.map((snapPoint) => {
    const sheetHeight = snapHeight(snapPoint, containerHeight);
    const visibleHeight = Math.max(0, sheetHeight - handleHeight);
    return { sheetHeight, scrollAreaHeight, visibleHeight, hidden: scrollAreaHeight - visibleHeight };
  });
}

/**
 * Até onde a lista rola: `naturalHeight` é a altura do conteúdo (já com a margem de baixo), `extra` o espaço somado no fim
 * (`hidden` com a correção, 0 sem ela). Conteúdo que cabe na parte visível dá 0: não rola.
 */
export function maxScrollOffset(naturalHeight: number, metrics: DetentMetrics, extra: number): number {
  return Math.max(0, naturalHeight + extra - metrics.scrollAreaHeight);
}
