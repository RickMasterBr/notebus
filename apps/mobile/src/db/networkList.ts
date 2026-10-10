/**
 * Consultas de leitura da rede (TL-11, E-08 bloco 1c, Item 2).
 * Apenas linhas vivas (selectLive), sem escrita.
 */
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { normalizeSearch } from "@notebus/domain";
import { selectLive } from "./query";
import { line, pattern, patternStop, type Source, stop } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface NetworkLineItem {
  id: string;
  code: string;
  name: string;
  color: string;
  source: Source;
  patternCount: number;
}

export interface NetworkStopItem {
  id: string;
  name: string;
  aliases: string[];
  externalId: string | null;
  source: Source;
}

export interface NetworkPatternStopItem {
  position: number;
  stopId: string;
  name: string;
  isTimepoint: boolean;
  timepointLabel: string | null;
}

export interface NetworkPatternItem {
  id: string;
  label: string;
  isCircular: boolean;
  stops: NetworkPatternStopItem[];
}

/**
 * Linhas vivas da rede com a contagem de percursos vivos,
 * ordenadas por `code` em ordem numérica ("2" antes de "11").
 */
export async function listLines(db: AnyDb): Promise<NetworkLineItem[]> {
  const [lines, patterns] = await Promise.all([
    selectLive(db, line),
    selectLive(db, pattern),
  ]);

  const patternCountByLine = new Map<string, number>();
  for (const p of patterns) {
    patternCountByLine.set(p.lineId, (patternCountByLine.get(p.lineId) ?? 0) + 1);
  }

  return lines
    .map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      color: l.color,
      source: l.source,
      patternCount: patternCountByLine.get(l.id) ?? 0,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "pt", { numeric: true }));
}

/**
 * Pontos vivos da rede ordenados por nome sem acento e sem diferenciar maiúsculas
 * (pontos com o mesmo nome ficam juntos, D-015).
 */
export async function listStops(db: AnyDb): Promise<NetworkStopItem[]> {
  const stops = await selectLive(db, stop);

  return stops
    .map((s) => ({
      id: s.id,
      name: s.name,
      aliases: s.aliases,
      externalId: s.externalId ?? null,
      source: s.source,
    }))
    .sort(
      (a, b) =>
        normalizeSearch(a.name).localeCompare(normalizeSearch(b.name), "pt") ||
        a.name.localeCompare(b.name, "pt") ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Percursos vivos de uma linha e suas paragens ordenadas por `position` crescente.
 * Paragens de pontos apagados não entram.
 */
export async function listPatternsOfLine(db: AnyDb, lineId: string): Promise<NetworkPatternItem[]> {
  const patterns = await selectLive(db, pattern, eq(pattern.lineId, lineId));
  if (patterns.length === 0) return [];

  const [patternStops, stops] = await Promise.all([
    selectLive(db, patternStop),
    selectLive(db, stop),
  ]);

  const stopNameById = new Map<string, string>();
  for (const s of stops) {
    stopNameById.set(s.id, s.name);
  }

  const result: NetworkPatternItem[] = [];
  for (const p of patterns) {
    const stopsOfPattern: NetworkPatternStopItem[] = [];
    for (const ps of patternStops) {
      if (ps.patternId !== p.id) continue;
      const name = stopNameById.get(ps.stopId);
      if (name === undefined) continue; // ponto apagado não aparece
      stopsOfPattern.push({
        position: ps.position,
        stopId: ps.stopId,
        name,
        isTimepoint: Boolean(ps.isTimepoint),
        timepointLabel: ps.timepointLabel ?? null,
      });
    }

    stopsOfPattern.sort((a, b) => a.position - b.position);

    result.push({
      id: p.id,
      label: p.label,
      isCircular: Boolean(p.isCircular),
      stops: stopsOfPattern,
    });
  }

  return result.sort((a, b) => a.label.localeCompare(b.label, "pt") || a.id.localeCompare(b.id));
}
