/**
 * O que a Busca (TL-14) mostra quando há termo: pontos, linhas ou "Nada encontrado". Lógica pura, sem React.
 *
 * Exemplo: "11" acha 0 pontos e 1 linha → só o grupo Linhas. No modo `pick` (escolher ponto no Registrar) linha não
 * serve, então não aparece nem segura o "Nada encontrado". Fora do `pick`, "Nada encontrado" espera as linhas carregarem.
 */
import { type SearchPanel, searchPanel } from "./searchPanel";

export interface SearchViewInput {
  term: string;
  recentCount: number;
  pick: boolean;
  stopCount: number;
  lineCount: number;
  linesReady: boolean;
}

export interface SearchView {
  panel: SearchPanel;
  showStops: boolean;
  showLines: boolean;
  showNoResults: boolean;
}

export function searchView({ term, recentCount, pick, stopCount, lineCount, linesReady }: SearchViewInput): SearchView {
  const panel = searchPanel(term, recentCount);
  const showStops = panel === "results" && stopCount > 0;
  const showLines = panel === "results" && !pick && lineCount > 0;
  const showNoResults = panel === "results" && !showStops && !showLines && (pick || linesReady);
  return { panel, showStops, showLines, showNoResults };
}
