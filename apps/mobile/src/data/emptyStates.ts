/**
 * Decisões puras para estados vazios (E-08.5 Bloco 14, D-198, ideias 2 e 51).
 * Puro: sem React e sem banco.
 */
export interface SearchEmptyInput {
  term: string;
  pick: boolean;
  stopTotal: number | null;
  recentCount: number;
  showNoResults?: boolean;
}

export type SearchEmptyResult =
  | "no_stops"
  | "prompt"
  | "prompt_pick"
  | "no_results"
  | null;

export function searchEmpty({
  term,
  pick,
  stopTotal,
  recentCount,
  showNoResults,
}: SearchEmptyInput): SearchEmptyResult {
  const trimmed = term.trim();
  if (trimmed === "") {
    if (stopTotal === 0) return "no_stops";
    if (recentCount > 0) return null;
    return pick ? "prompt_pick" : "prompt";
  }
  return showNoResults ? "no_results" : null;
}

export interface NetworkEmptyInput {
  stopCount: number;
  lineCount: number;
}

export interface NetworkEmptyResult {
  stops: "net.empty.stops" | null;
  lines: "net.empty.lines_need_stops" | "net.empty.lines" | null;
}

export function networkEmpty({ stopCount, lineCount }: NetworkEmptyInput): NetworkEmptyResult {
  const stops = stopCount === 0 ? ("net.empty.stops" as const) : null;
  let lines: "net.empty.lines_need_stops" | "net.empty.lines" | null = null;
  if (lineCount === 0) {
    lines = stopCount < 2 ? "net.empty.lines_need_stops" : "net.empty.lines";
  }
  return { stops, lines };
}

export interface AlarmsEmptyInput {
  placeCount: number;
}

export type AlarmsEmptyResult = "places" | "new_place";

export function alarmsEmpty({ placeCount }: AlarmsEmptyInput): AlarmsEmptyResult {
  return placeCount >= 1 ? "places" : "new_place";
}
