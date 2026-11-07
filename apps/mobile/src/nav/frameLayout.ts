/**
 * Estado e validação do layout da moldura de tela empilhada.
 * O contêiner da biblioteca começa em top: topInset, então a altura dele é a da tela menos topInset [hipótese, só o aparelho decide].
 */

export interface FrameLayoutState {
  height: number;
  offset: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
}

/** Altura pronta quando finita e estritamente positiva [hipótese, só o aparelho decide]. */
export function frameReady(height: number): boolean {
  return Number.isFinite(height) && height > 0;
}

/**
 * Monta o estado de layout para o contêiner interno da folha [hipótese, só o aparelho decide].
 * O contêiner começa em top: topInset, então a altura útil é a da tela menos topInset.
 */
export function frameLayoutState(frameHeight: number, topInset: number): FrameLayoutState | null {
  const height = frameHeight - topInset;
  if (!frameReady(height)) {
    return null;
  }
  return {
    height,
    offset: {
      top: topInset,
      left: 0,
      right: 0,
      bottom: 0,
    },
  };
}

/** Só reaplica a altura se a diferença for de pelo menos 1 pixel [hipótese, só o aparelho decide]. */
export function heightChanged(previous: number, next: number): boolean {
  return Math.abs(next - previous) >= 1;
}
