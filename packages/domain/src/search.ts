/**
 * Busca de pontos (TL-14, Fase 1 §2.1): casa nome, apelidos e ID externo, sem acento e sem diferenciar maiúsculas.
 * Exemplo: "arrab" e "ARRÁB" acham "Arrabalde da Ponte"; "3517" acha a Qta. do Seminário pelo ID.
 */

export interface SearchableStop {
  id: string;
  name: string;
  aliases: readonly string[];
  externalId: string | null;
}

/** Minúsculas e sem acento: "Estação" → "estacao". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * Pontos que casam com o termo. Termo vazio devolve nada.
 * Ordem: quem começa com o termo (nome, apelido ou ID) antes de quem só contém; dentro de cada grupo, alfabética pelo nome.
 */
export function searchStops<T extends SearchableStop>(stops: readonly T[], term: string): T[] {
  const needle = normalizeSearch(term);
  if (needle === "") return [];
  const hits: { stop: T; startsWith: boolean }[] = [];
  for (const stop of stops) {
    const fields = [stop.name, ...stop.aliases, ...(stop.externalId ? [stop.externalId] : [])].map(normalizeSearch);
    if (!fields.some((f) => f.includes(needle))) continue;
    hits.push({ stop, startsWith: fields.some((f) => f.startsWith(needle)) });
  }
  return hits
    .sort(
      (a, b) =>
        Number(b.startsWith) - Number(a.startsWith) ||
        normalizeSearch(a.stop.name).localeCompare(normalizeSearch(b.stop.name), "pt"),
    )
    .map((h) => h.stop);
}

export interface SearchableLine {
  id: string;
  code: string;
  name: string;
}

/**
 * Linhas que casam com o termo no código ou no nome. Termo vazio devolve nada.
 * Faixas: (0) código igual ao termo; (1) código ou nome começa com o termo; (2) só contém.
 * Dentro da faixa: código em ordem numérica ("2" antes de "11"); empate, pelo id.
 * Exemplo: "1" devolve 1, 10, 11, 12, 21.
 */
export function searchLines<T extends SearchableLine>(lines: readonly T[], term: string): T[] {
  const needle = normalizeSearch(term);
  if (needle === "") return [];
  const hits: { line: T; rank: number }[] = [];
  for (const line of lines) {
    const code = normalizeSearch(line.code);
    const name = normalizeSearch(line.name);
    if (!code.includes(needle) && !name.includes(needle)) continue;
    const rank = code === needle ? 0 : code.startsWith(needle) || name.startsWith(needle) ? 1 : 2;
    hits.push({ line, rank });
  }
  return hits
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.line.code.localeCompare(b.line.code, "pt", { numeric: true }) ||
        a.line.id.localeCompare(b.line.id),
    )
    .map((h) => h.line);
}
