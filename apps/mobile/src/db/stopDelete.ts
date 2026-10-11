/**
 * Apagar ponto seu e Desfazer (E-08 §5.4, D-112, bloco 7, Item 2).
 * Só apaga ponto criado por você e que nada usa: registro, tempo a pé, trajeto ou percurso de linha vivos.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { inTransaction, type AnyDb } from "./inTransaction";
import { selectLive } from "./query";
import { observation, option, pattern, patternStop, stop, walkTime } from "./schema";
import type { StopEditUndo } from "./stopEdit";

export interface StopUsage {
  patternStops: number;
  observations: number;
  walkTimes: number;
  options: number;
}

export type DeleteStopResult =
  | { ok: true; undo: StopEditUndo }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "official" }
  | { ok: false; reason: "in_use"; usage: StopUsage };

export const isUnused = (usage: StopUsage) =>
  usage.patternStops + usage.observations + usage.walkTimes + usage.options === 0;

/** Quantas linhas vivas usam o ponto. Linha apagada não conta. */
export async function stopUsage(db: AnyDb, stopId: string): Promise<StopUsage> {
  const [passages, observations, walkTimes, livePatterns] = await Promise.all([
    selectLive(db, patternStop, eq(patternStop.stopId, stopId)),
    selectLive(db, observation, eq(observation.stopId, stopId)),
    selectLive(db, walkTime, eq(walkTime.stopId, stopId)),
    selectLive(db, pattern),
  ]);
  const livePatternIds = new Set(livePatterns.map((p) => p.id));
  const livePassages = passages.filter((p) => livePatternIds.has(p.patternId));

  const passageIds = livePassages.map((p) => p.id);
  const options =
    passageIds.length === 0
      ? []
      : await selectLive(
          db,
          option,
          or(inArray(option.boardPatternStopId, passageIds), inArray(option.alightPatternStopId, passageIds)),
        );

  return {
    patternStops: livePassages.length,
    observations: observations.length,
    walkTimes: walkTimes.length,
    options: options.length,
  };
}

export async function deleteStop(db: AnyDb, stopId: string, nowMs: number): Promise<DeleteStopResult> {
  return inTransaction(db, async (): Promise<DeleteStopResult> => {
    const [existing] = await selectLive(db, stop, eq(stop.id, stopId));
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.source !== "user" || existing.officialKey !== null) return { ok: false, reason: "official" };

    const usage = await stopUsage(db, stopId);
    if (!isUnused(usage)) return { ok: false, reason: "in_use", usage };

    const deletedAt = Math.max(nowMs, existing.updatedAt + 1);
    await db.update(stop).set({ deletedAt, updatedAt: deletedAt }).where(eq(stop.id, stopId));

    const undo: StopEditUndo = async () =>
      inTransaction(db, async () => {
        const [current] = await db
          .select()
          .from(stop)
          .where(and(eq(stop.id, stopId), eq(stop.deletedAt, deletedAt)));
        if (!current || current.updatedAt !== deletedAt) return { ok: false, reason: "stale" };
        await db.update(stop).set({ deletedAt: null, updatedAt: existing.updatedAt }).where(eq(stop.id, stopId));
        return { ok: true };
      });

    return { ok: true, undo };
  });
}
