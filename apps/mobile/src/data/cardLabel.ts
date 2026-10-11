/** Rótulo de acessibilidade do cartão de ponto: o texto base e, se houver, os apelidos depois de uma vírgula (E-08 bloco 7). */
export function cardLabel(base: string, aliases?: string | null): string {
  return aliases ? `${base}, ${aliases}` : base;
}
