export interface HomeSmallDetentInput {
  handleHeight: number;
  /** Altura efetiva do cartão fixo (0 sem cartão). */
  cardHeight: number;
  pillHeight: number;
  insetBottom: number;
  margin: number;
  /** Valor até o handle e a pílula serem medidos. */
  fallback: number;
}

export interface HomeSmallPlan {
  small: number;
}

/** Detent pequeno da Início: handle + cartão + pílula + área segura + margem; `fallback` até a primeira medida (E-09 Bloco 20b). */
export function homeSmallDetent({ handleHeight, cardHeight, pillHeight, insetBottom, margin, fallback }: HomeSmallDetentInput): number {
  if (!(handleHeight > 0 && pillHeight > 0)) return fallback;
  return handleHeight + cardHeight + pillHeight + insetBottom + margin;
}

/** Função pura que devolve o plano consumido por campo (E-09 Bloco 20b). */
export function homeSmallPlan(input: HomeSmallDetentInput): HomeSmallPlan {
  return { small: homeSmallDetent(input) };
}

/**
 * Valor do detent pequeno que vai para os `snapPoints`. Com a gaveta no meio do caminho (na tela e fora de qualquer
 * detent), o valor anterior se mantém: trocar o detent com o dedo na tela faz a biblioteca reaplicá-lo (E-09 Bloco 20b).
 * Parada num detent, ou ainda fora da tela, o `small` novo vale. Nunca muda por menos de 0,5 pt.
 */
export function nextSnapSmall(prev: number, small: number, sheetTop: number, screenHeight: number, otherTops: readonly number[]): number {
  if (Math.abs(prev - small) < 0.5) return prev;
  const tops = [screenHeight - prev, ...otherTops];
  const inMotion = sheetTop <= screenHeight && !tops.some((top) => Math.abs(sheetTop - top) < 1);
  return inMotion ? prev : small;
}
