/**
 * O que a Busca (TL-14) mostra abaixo do campo (D-137). Lógica pura, sem React.
 *
 * Exemplo: termo vazio e 2 pontos abertos antes → "recents"; termo vazio e nenhum → "prompt";
 * qualquer termo → "results" (a lista ou o "Nada encontrado para …").
 */
export type SearchPanel = "recents" | "prompt" | "results";

export function searchPanel(term: string, recentCount: number): SearchPanel {
  if (term.trim() !== "") return "results";
  return recentCount > 0 ? "recents" : "prompt";
}
