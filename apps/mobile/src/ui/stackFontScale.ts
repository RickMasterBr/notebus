/** Acima de `.xxLarge` (≈ 1,24× o texto) as linhas lado a lado não cabem e empilham (4.6 §6). Um só limiar para as folhas e o cartão. */
export const STACK_FONT_SCALE = 1.25;

/** Com o texto grande, "Desci aqui" e as ações em texto do cartão "Em viagem" não cabem na mesma linha: empilham. */
export const shouldStackTripButtons = (fontScale: number) => fontScale >= STACK_FONT_SCALE;
