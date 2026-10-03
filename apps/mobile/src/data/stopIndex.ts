/**
 * Dados em memória para a busca (E-02 §4.1): os pontos e, por ponto, os códigos das linhas que passam nele.
 * Carregados do banco uma vez, na abertura do app; nada de coluna nova. Tudo passa por `selectLive`.
 *
 * Exemplo: o ponto "Praça Inventada" passa na L1 e na L3 → `lines: ["1", "3"]`.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SearchableStop } from "@notebus/domain";
import { selectLive } from "../db/query";
import { line, pattern, patternStop, stop } from "../db/schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface StopEntry extends SearchableStop {
  /** Códigos das linhas que servem o ponto, sem repetir, em ordem numérica ("2" antes de "11"). */
  lines: string[];
}

export async function loadStopIndex(db: AnyDb): Promise<StopEntry[]> {
  const stops = await selectLive(db, stop);
  const links = await db
    .select({ stopId: patternStop.stopId, code: line.code })
    .from(patternStop)
    .innerJoin(pattern, and(isNull(pattern.deletedAt), eq(pattern.id, patternStop.patternId)))
    .innerJoin(line, and(isNull(line.deletedAt), eq(line.id, pattern.lineId)))
    .where(isNull(patternStop.deletedAt));

  const byStop = new Map<string, Set<string>>();
  for (const { stopId, code } of links) {
    const set = byStop.get(stopId) ?? new Set<string>();
    set.add(code);
    byStop.set(stopId, set);
  }
  return stops.map((s) => ({
    id: s.id,
    name: s.name,
    aliases: s.aliases,
    externalId: s.externalId,
    lines: [...(byStop.get(s.id) ?? [])].sort((a, b) => a.localeCompare(b, "pt", { numeric: true })),
  }));
}
