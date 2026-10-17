/**
 * Os atalhos de lugares no topo da Busca (E-09 bloco 28, ideia 27). Lógica pura, sem React.
 *
 * Exemplo: campo vazio, busca comum, lugares carregados e 2 atalhos → mostra; o Rick digita "ca" → some.
 */
export function savedPlacesOnSearch(input: {
  term: string;
  pick: boolean;
  placesReady: boolean;
  shortcutCount: number;
}): { show: boolean } {
  return { show: input.term.trim() === "" && !input.pick && input.placesReady && input.shortcutCount > 0 };
}
