/**
 * Decisões puras para exclusão, rollback e visibilidade em Registros (E-09 Bloco 1, FN-1, R2, R3, R9).
 * Puro: sem React, sem banco, sem relógio.
 */
import type { ObservationRow } from "./registro";

export const DEFAULT_WINDOW_DAYS = 14;
export const WINDOW_DAYS_STEP = 14;

/** Devolve os IDs a esconder: par (embarque + descida) ou linha avulsa (R3). */
export function idsToHide(boardingId: string, alightingId?: string | null): string[] {
  if (alightingId) {
    return [boardingId, alightingId];
  }
  return [boardingId];
}

/** Adiciona IDs ao conjunto de excluídos em memória. */
export function hide(prev: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(prev);
  for (const id of ids) {
    next.add(id);
  }
  return next;
}

/** Remove IDs do conjunto de excluídos (rollback em caso de erro na exclusão, R2). */
export function unhide(prev: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(prev);
  for (const id of ids) {
    next.delete(id);
  }
  return next;
}

/**
 * Tira de deletedIds os IDs que reapareceram vivos (deletedAt == null, ex.: Desfazer),
 * mantendo os que continuam apagados (R9).
 */
export function pruneRevived(
  prev: Set<string>,
  observations: readonly Pick<ObservationRow, "id" | "deletedAt">[],
): Set<string> {
  if (prev.size === 0) return prev;
  let changed = false;
  const next = new Set(prev);
  for (const obsId of prev) {
    const obs = observations.find((o) => o.id === obsId);
    if (obs && obs.deletedAt == null) {
      next.delete(obsId);
      changed = true;
    }
  }
  return changed ? next : prev;
}

/** Filtra observações excluindo as que estão em hidden (não perde nenhum item de Para conferir). */
export function visibleObservations<T extends { id: string }>(
  observations: readonly T[],
  hidden: ReadonlySet<string>,
): readonly T[] {
  if (hidden.size === 0) return observations;
  return observations.filter((o) => !hidden.has(o.id));
}

/** Calcula a próxima janela de dias ao carregar mais (R1, R7, R8). */
export function nextWindowDays(
  hasMore: boolean,
  current: number = DEFAULT_WINDOW_DAYS,
  step: number = WINDOW_DAYS_STEP,
): number {
  if (!hasMore) return current;
  return current + step;
}
