/**
 * Apagar linha sua e Desfazer (E-08 §5.4, D-112, bloco 9, Item 4).
 * Só apaga linha criada por você e que nada usa (registro ou trajeto vivos). Apaga logicamente a linha e tudo que ela
 * criou, com o mesmo `deletedAt`; o Desfazer devolve cada linha com o `updatedAt` que tinha, se ninguém mexeu na linha.
 */
import { and, eq, inArray } from "drizzle-orm";
import { inTransaction, type AnyDb } from "./inTransaction";
import { selectLive } from "./query";
import { isLineUnused, lineUsage, type LineUsage } from "./lineUsage";
import { frequency, frequencyDayType, line, pattern, patternStop, stopTime, timetable, trip, tripDayType } from "./schema";
import type { StopEditUndo } from "./stopEdit";

export type DeleteLineResult =
  | { ok: true; undo: StopEditUndo }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "official" }
  | { ok: false; reason: "in_use"; usage: LineUsage };

const CHUNK = 100;

/** Uma linha de tabela que o apagar tocou, com o `updatedAt` de antes. */
type Touched = { table: unknown; id: string; updatedAt: number };

/** As tabelas têm as colunas comuns (`id`, `updatedAt`, `deletedAt`); o tipo de uma serve para todas neste helper. */
type CommonTable = typeof line;

async function liveIn(db: AnyDb, table: unknown, column: unknown, ids: readonly string[]) {
  const t = table as CommonTable;
  const rows: { id: string; updatedAt: number }[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const found = await selectLive(db, t, inArray(column as CommonTable["id"], ids.slice(i, i + CHUNK)));
    rows.push(...found.map((r) => ({ id: r.id, updatedAt: r.updatedAt })));
  }
  return rows;
}

/** Tudo que a linha criou e ainda está vivo, de cima para baixo: percurso → paragens/tabelas/frequências → viagens → vínculos e horários. */
async function liveRowsOfLine(db: AnyDb, lineId: string): Promise<Touched[]> {
  const touched: Touched[] = [];
  const add = (table: unknown, rows: { id: string; updatedAt: number }[]) => {
    for (const r of rows) touched.push({ table, id: r.id, updatedAt: r.updatedAt });
    return rows.map((r) => r.id);
  };

  const patternIds = add(pattern, await liveIn(db, pattern, pattern.lineId, [lineId]));
  add(patternStop, await liveIn(db, patternStop, patternStop.patternId, patternIds));
  const timetableIds = add(timetable, await liveIn(db, timetable, timetable.patternId, patternIds));
  const frequencyIds = add(frequency, await liveIn(db, frequency, frequency.patternId, patternIds));
  add(frequencyDayType, await liveIn(db, frequencyDayType, frequencyDayType.frequencyId, frequencyIds));
  const tripIds = add(trip, await liveIn(db, trip, trip.timetableId, timetableIds));
  add(tripDayType, await liveIn(db, tripDayType, tripDayType.tripId, tripIds));
  add(stopTime, await liveIn(db, stopTime, stopTime.tripId, tripIds));
  return touched;
}

async function setStamps(db: AnyDb, table: unknown, ids: readonly string[], stamps: { deletedAt: number | null; updatedAt: number }) {
  const t = table as CommonTable;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await db.update(t).set(stamps).where(inArray(t.id, ids.slice(i, i + CHUNK)));
  }
}

export async function deleteLine(db: AnyDb, lineId: string, nowMs: number): Promise<DeleteLineResult> {
  return inTransaction(db, async (): Promise<DeleteLineResult> => {
    const [existing] = await selectLive(db, line, eq(line.id, lineId));
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.source !== "user" || existing.officialKey !== null) return { ok: false, reason: "official" };

    const usage = await lineUsage(db, lineId);
    if (!isLineUnused(usage)) return { ok: false, reason: "in_use", usage };

    const deletedAt = Math.max(nowMs, existing.updatedAt + 1);
    const touched = [{ table: line, id: lineId, updatedAt: existing.updatedAt }, ...(await liveRowsOfLine(db, lineId))];

    const tables = [...new Set(touched.map((t) => t.table))];
    for (const table of tables) {
      await setStamps(db, table, touched.filter((t) => t.table === table).map((t) => t.id), { deletedAt, updatedAt: deletedAt });
    }

    const undo: StopEditUndo = async () =>
      inTransaction(db, async () => {
        const [current] = await db
          .select()
          .from(line)
          .where(and(eq(line.id, lineId), eq(line.deletedAt, deletedAt)));
        if (!current || current.updatedAt !== deletedAt) return { ok: false, reason: "stale" };

        for (const table of tables) {
          const byOldStamp = new Map<number, string[]>();
          for (const t of touched.filter((x) => x.table === table)) {
            byOldStamp.set(t.updatedAt, [...(byOldStamp.get(t.updatedAt) ?? []), t.id]);
          }
          for (const [updatedAt, ids] of byOldStamp) await setStamps(db, table, ids, { deletedAt: null, updatedAt });
        }
        return { ok: true };
      });

    return { ok: true, undo };
  });
}
