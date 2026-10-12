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

const LINE_PREFIX = /^(?:linha|l)\s*([a-z0-9_-]+)$/;

/** Faixa do código para um termo: igual (0), começa (1), só contém (2); sem relação, null. */
function codeRank(code: string, term: string): number | null {
  if (code === term) return 0;
  if (code.startsWith(term)) return 1;
  return code.includes(term) ? 2 : null;
}

/**
 * Linhas que casam com o termo no código ou no nome. Termo vazio devolve nada.
 * Faixas: (0) código igual ao termo; (1) código ou nome começa com o termo; (2) só contém.
 * Dentro da faixa: código em ordem numérica ("2" antes de "11"); empate, pelo id.
 * Segunda leitura: "L" ou "linha" antes do código ("L1", "linha 11") vale como o código sozinho, só no código (não no nome),
 * com as mesmas faixas; a linha fica com a melhor faixa das duas leituras.
 * Exemplo: "1" devolve 1, 10, 11, 12, 21; "L1" devolve os mesmos.
 */
export function searchLines<T extends SearchableLine>(lines: readonly T[], term: string): T[] {
  const needle = normalizeSearch(term);
  if (needle === "") return [];
  const rest = LINE_PREFIX.exec(needle)?.[1] ?? null;
  const hits: { line: T; rank: number }[] = [];
  for (const line of lines) {
    const code = normalizeSearch(line.code);
    const name = normalizeSearch(line.name);
    const direct =
      !code.includes(needle) && !name.includes(needle)
        ? null
        : code === needle
          ? 0
          : code.startsWith(needle) || name.startsWith(needle)
            ? 1
            : 2;
    const prefixed = rest === null ? null : codeRank(code, rest);
    const rank = direct === null ? prefixed : prefixed === null ? direct : Math.min(direct, prefixed);
    if (rank === null) continue;
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
