/**
 * Continuidade do aprendizado entre vigências no app (C5 da E3, ADR-0007 §9, D-375): puro, sem banco e sem relógio.
 * A família do percurso vem do `official_key`; o percurso "em vigor no dia" vem dos quadros já lidos. Nada é gravado.
 */
import { samePassage, type PatternData, type TripData } from "@notebus/domain";
import type { ScheduleSnapshot } from "./schedule";

/** `mobilis/<vigência>/pattern/<código>` → `mobilis/pattern/<código>`; outra forma (ou nulo) → `undefined`. */
export function familyOfOfficialKey(key: string | null | undefined): string | undefined {
  const m = key == null ? null : /^([^/]+)\/[^/]+\/pattern\/(.+)$/.exec(key);
  return m ? `${m[1]}/pattern/${m[2]}` : undefined;
}

const indexes = new WeakMap<ScheduleSnapshot, Map<string, PatternData>>();

function patternById(data: ScheduleSnapshot, id: string): PatternData | undefined {
  let index = indexes.get(data);
  if (!index) {
    index = new Map(data.patterns.map((p) => [p.id, p]));
    indexes.set(data, index);
  }
  return index.get(id);
}

export function familyOfPattern(data: ScheduleSnapshot, patternId: string): string | undefined {
  return patternById(data, patternId)?.family;
}

/** Sem dado de quadros, vale (o resultado é o de hoje). As duas pontas valem, como em `tripsRunningOn`. */
function inForce(data: ScheduleSnapshot, patternId: string, date: string): boolean {
  const quadros = data.patternQuadros?.get(patternId);
  if (!quadros) return true;
  return quadros.some((q) => q.validFrom <= date && (q.validTo === null || date <= q.validTo));
}

/** O próprio percurso, ou o da mesma família em vigor no dia; nunca pior que o próprio. */
export function patternInForceOn(data: ScheduleSnapshot, patternId: string, date: string): PatternData | undefined {
  const own = patternById(data, patternId);
  if (!own || own.family === undefined || inForce(data, patternId, date)) return own;
  return data.patterns.find((p) => p.family === own.family && p.id !== patternId && inForce(data, p.id, date)) ?? own;
}

/** A posição, em `to`, da mesma passagem do `pattern_stop` guardado; `null` se não se traduz. */
export function passagePositionIn(data: ScheduleSnapshot, patternStopId: string, to: PatternData): number | null {
  const at = data.patternStopById.get(patternStopId);
  if (!at) return null;
  if (at.patternId === to.id) return at.position;
  const from = patternById(data, at.patternId);
  if (!from || from.family === undefined || from.family !== to.family) return null;
  return samePassage(from, at.position, to);
}

/**
 * As viagens vistas pelo percurso da opção: a de outro percurso da mesma família ganha o `patternId` e as posições do
 * percurso da opção (mesma passagem); posição sem correspondente sai e a viagem sem primeira ou última sai.
 * O resto passa igual.
 */
export function tripsSeenByOptionPatterns(data: ScheduleSnapshot, trips: TripData[], optionPatterns: PatternData[]): TripData[] {
  const byFamily = new Map<string, PatternData>();
  for (const p of optionPatterns) if (p.family !== undefined) byFamily.set(p.family, p);
  if (byFamily.size === 0) return trips;
  const out: TripData[] = [];
  for (const t of trips) {
    const from = patternById(data, t.patternId);
    const to = from?.family === undefined ? undefined : byFamily.get(from.family);
    if (!from || !to || to.id === from.id) {
      out.push(t);
      continue;
    }
    const first = samePassage(from, t.firstPosition, to);
    const last = samePassage(from, t.lastPosition, to);
    if (first === null || last === null) continue;
    const stopTimes = t.stopTimes.flatMap((s) => {
      const position = samePassage(from, s.position, to);
      return position === null ? [] : [{ ...s, position }];
    });
    out.push({ ...t, patternId: to.id, firstPosition: first, lastPosition: last, stopTimes });
  }
  return out;
}
