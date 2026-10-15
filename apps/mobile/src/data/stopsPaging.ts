/**
 * Regra pura da paginação e busca da lista de pontos em "Linhas e pontos" (TL-11, D-188).
 * Sem React, sem relógio.
 */
import { type SearchableStop, normalizeSearch, searchStops } from "@notebus/domain";

export const STOPS_PAGE_SIZE = 50;

export interface StopsPageView<T> {
  searching: boolean;
  total: number;
  pageCount: number;
  page: number; // 0-based, já limitada a 0..pageCount-1
  items: T[];
  from: number; // 1-based, 0 se vazio
  to: number; // 1-based, 0 se vazio
  hasPrev: boolean;
  hasNext: boolean;
  showPager: boolean; // pageCount > 1
  showNoMatch: boolean; // searching && total === 0
}

export function isSearching(term: string): boolean {
  return normalizeSearch(term) !== "";
}

interface CachedStop<T = SearchableStop> {
  readonly stop: T;
  readonly normName: string;
  readonly fields: readonly string[];
}

const stopsCache = new WeakMap<readonly SearchableStop[], readonly CachedStop<SearchableStop>[]>();

function getCachedStops(stops: readonly SearchableStop[]): readonly CachedStop<SearchableStop>[] {
  const existing = stopsCache.get(stops);
  if (existing) return existing;

  const built: CachedStop<SearchableStop>[] = stops.map((stop) => ({
    stop,
    normName: normalizeSearch(stop.name),
    fields: [stop.name, ...stop.aliases, ...(stop.externalId ? [stop.externalId] : [])].map(normalizeSearch),
  }));
  stopsCache.set(stops, built);
  return built;
}

export function matchStops<T extends SearchableStop>(stops: readonly T[], term: string): readonly T[] {
  const needle = normalizeSearch(term);
  if (needle === "") {
    return stops.slice();
  }

  const cached = getCachedStops(stops);
  const hits: { stop: T; normName: string; startsWith: boolean }[] = [];

  for (let i = 0; i < cached.length; i++) {
    const item = cached[i]!;
    const fields = item.fields;
    let includes = false;
    let startsWith = false;
    for (let j = 0; j < fields.length; j++) {
      const f = fields[j]!;
      if (f.includes(needle)) {
        includes = true;
        if (f.startsWith(needle)) {
          startsWith = true;
          break;
        }
      }
    }
    if (includes) {
      hits.push({ stop: stops[i]!, normName: item.normName, startsWith });
    }
  }

  return hits
    .sort(
      (a, b) =>
        Number(b.startsWith) - Number(a.startsWith) ||
        a.normName.localeCompare(b.normName, "pt"),
    )
    .map((h) => h.stop);
}

export function sliceStopsPage<T>(input: {
  matched: readonly T[];
  page: number;
  searching: boolean;
}): StopsPageView<T> {
  const { matched, page: rawPage, searching } = input;
  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / STOPS_PAGE_SIZE));
  const page = Math.max(0, Math.min(pageCount - 1, rawPage));

  const start = page * STOPS_PAGE_SIZE;
  const items = matched.slice(start, start + STOPS_PAGE_SIZE);

  const from = items.length === 0 ? 0 : start + 1;
  const to = items.length === 0 ? 0 : start + items.length;

  const hasPrev = page > 0;
  const hasNext = page < pageCount - 1;
  const showPager = pageCount > 1;
  const showNoMatch = searching && total === 0;

  return {
    searching,
    total,
    pageCount,
    page,
    items,
    from,
    to,
    hasPrev,
    hasNext,
    showPager,
    showNoMatch,
  };
}

export function stopsPageView<T extends SearchableStop>(input: {
  stops: readonly T[];
  term: string;
  page: number;
}): StopsPageView<T> {
  const needle = normalizeSearch(input.term);
  const searching = needle !== "";
  const matched = matchStops(input.stops, input.term);
  return sliceStopsPage({ matched, page: input.page, searching });
}

/** Índice do item de id "header-stops"; -1 se não existir. */
export function stopsAnchorIndex(items: readonly { id: string }[]): number {
  return items.findIndex((item) => item.id === "header-stops");
}
