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

export function matchStops<T extends SearchableStop>(stops: readonly T[], term: string): readonly T[] {
  const needle = normalizeSearch(term);
  if (needle === "") {
    return stops.slice();
  }
  return searchStops(stops, term);
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
