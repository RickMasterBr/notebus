/**
 * Criação de linha e Desfazer (E-08 §5.3, bloco 9, Item 3).
 * A linha nasce `source = "user"`, sem chave oficial, com um percurso, uma tabela de horários e as viagens do rascunho.
 * Cada viagem tem horário só na primeira e na última posição; o resto o domínio interpola (`baseTimeAt`).
 * Os horários são `origin = "official"` de propósito: `declared` é o horário que a pessoa pode remover, e removê-lo
 * apagaria a viagem por baixo (declaredTimes.removeDeclared).
 * Uma transação só: tudo ou nada. O Desfazer apaga logicamente tudo que foi criado, e só se ninguém mexeu na linha
 * e nada a usa (registro ou trajeto vivos, T-129): senão apagaria uma linha em uso.
 */
import { lisbonWallClock, uuidv7 } from "@notebus/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { validateLineDraft, type LineDraft } from "../data/lineDraft";
import { inTransaction, type AnyDb } from "./inTransaction";
import { isLineUnused, lineUsage } from "./lineUsage";
import { selectLive } from "./query";
import {
  dayType,
  frequency,
  frequencyDayType,
  line,
  network,
  pattern,
  patternStop,
  stop,
  stopTime,
  timetable,
  trip,
  tripDayType,
} from "./schema";
import type { StopEditUndo } from "./stopEdit";

export type CreateLineRefusal = "invalid" | "no_network" | "duplicate_code" | "unknown_stop" | "unknown_day_type";

export type CreateLineResult =
  | { ok: true; lineId: string; patternId: string; tripCount: number; undo: StopEditUndo }
  | { ok: false; reason: CreateLineRefusal };

/** Linhas por INSERT: com 10 colunas por linha fica longe do limite de variáveis do SQLite. */
const INSERT_CHUNK = 50;

async function insertChunked<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) await insert(rows.slice(i, i + INSERT_CHUNK));
}

type Created = {
  line: string;
  pattern: string;
  patternStop: string[];
  timetable: string;
  trip: string[];
  tripDayType: string[];
  stopTime: string[];
  frequency: string[];
  frequencyDayType: string[];
};

/** As tabelas têm as colunas comuns (`id`, `updatedAt`, `deletedAt`); o tipo de uma serve para todas neste helper. */
async function softDelete(db: AnyDb, table: unknown, ids: readonly string[], deletedAt: number) {
  const t = table as typeof line;
  await insertChunked(ids, (chunk) =>
    db.update(t).set({ deletedAt, updatedAt: deletedAt }).where(and(inArray(t.id, chunk), isNull(t.deletedAt))),
  );
}

export async function createLine(
  db: AnyDb,
  draft: LineDraft,
  nowMs: number,
  deps: { newId?: (now: number) => string } = {},
): Promise<CreateLineResult> {
  const checked = validateLineDraft(draft);
  if (!checked.ok) return { ok: false, reason: "invalid" };
  const value = checked.value;
  const newId = deps.newId ?? uuidv7;

  return inTransaction(db, async (): Promise<CreateLineResult> => {
    const [liveNetwork] = await selectLive(db, network);
    if (!liveNetwork) return { ok: false, reason: "no_network" };

    const wantedCode = value.code.toLowerCase();
    const liveLines = await selectLive(db, line);
    if (liveLines.some((l) => l.code.trim().toLowerCase() === wantedCode)) return { ok: false, reason: "duplicate_code" };

    const distinctStopIds = [...new Set(value.pattern.stopIds)];
    const liveStops = await selectLive(db, stop, inArray(stop.id, distinctStopIds));
    if (liveStops.length !== distinctStopIds.length) return { ok: false, reason: "unknown_stop" };

    const liveDayTypes = await selectLive(db, dayType, eq(dayType.networkId, liveNetwork.id));
    const dayTypeIdByCode = new Map(liveDayTypes.map((d) => [d.code, d.id]));
    const dayTypeIds: string[] = [];
    for (const code of value.dayTypeCodes) {
      const id = dayTypeIdByCode.get(code);
      if (id === undefined) return { ok: false, reason: "unknown_day_type" };
      dayTypeIds.push(id);
    }

    const base = { createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user" as const, officialKey: null };
    const stopCount = value.pattern.stopIds.length;
    const created: Created = {
      line: newId(nowMs),
      pattern: newId(nowMs),
      patternStop: [],
      timetable: newId(nowMs),
      trip: [],
      tripDayType: [],
      stopTime: [],
      frequency: [],
      frequencyDayType: [],
    };

    await db.insert(line).values({
      ...base,
      id: created.line,
      networkId: liveNetwork.id,
      code: value.code,
      name: value.name,
      color: value.color,
    });
    await db.insert(pattern).values({
      ...base,
      id: created.pattern,
      lineId: created.line,
      label: value.pattern.label,
      isCircular: value.pattern.isCircular,
    });

    const patternStopRows = value.pattern.stopIds.map((stopId, index) => {
      const id = newId(nowMs);
      created.patternStop.push(id);
      return {
        ...base,
        id,
        patternId: created.pattern,
        position: index + 1,
        stopId,
        isTimepoint: index === 0 || index === stopCount - 1,
        timepointLabel: null,
      };
    });
    await insertChunked(patternStopRows, (chunk) => db.insert(patternStop).values(chunk));

    await db.insert(timetable).values({
      ...base,
      id: created.timetable,
      patternId: created.pattern,
      datasetId: null,
      validFrom: lisbonWallClock(nowMs).date,
      validTo: null,
    });

    let frequencyId: string | null = null;
    if (value.frequency) {
      frequencyId = newId(nowMs);
      created.frequency.push(frequencyId);
      const refPatternStop = patternStopRows[value.frequency.refPosition - 1]!;
      await db.insert(frequency).values({
        ...base,
        id: frequencyId,
        patternId: created.pattern,
        refPatternStopId: refPatternStop.id,
        fromMinute: value.frequency.fromMinute,
        toMinute: value.frequency.toMinute,
        headwayMinutes: value.frequency.headwayMinutes,
      });
      const frequencyDayTypeRows = dayTypeIds.map((dayTypeId) => {
        const id = newId(nowMs);
        created.frequencyDayType.push(id);
        return { ...base, id, frequencyId: frequencyId as string, dayTypeId };
      });
      await insertChunked(frequencyDayTypeRows, (chunk) => db.insert(frequencyDayType).values(chunk));
    }

    const firstPatternStopId = patternStopRows[0]!.id;
    const lastPatternStopId = patternStopRows[stopCount - 1]!.id;
    const tripRows: (typeof trip.$inferInsert)[] = [];
    const tripDayTypeRows: (typeof tripDayType.$inferInsert)[] = [];
    const stopTimeRows: (typeof stopTime.$inferInsert)[] = [];

    for (const departure of value.departureMinutes) {
      const tripId = newId(nowMs);
      created.trip.push(tripId);
      tripRows.push({
        ...base,
        id: tripId,
        timetableId: created.timetable,
        firstPosition: 1,
        lastPosition: stopCount,
        seasonId: null,
        frequencyId,
      });
      for (const dayTypeId of dayTypeIds) {
        const id = newId(nowMs);
        created.tripDayType.push(id);
        tripDayTypeRows.push({ ...base, id, tripId, dayTypeId });
      }
      for (const [patternStopId, serviceMinute] of [
        [firstPatternStopId, departure],
        [lastPatternStopId, departure + value.durationMinutes],
      ] as const) {
        const id = newId(nowMs);
        created.stopTime.push(id);
        stopTimeRows.push({ ...base, id, tripId, patternStopId, serviceMinute, origin: "official" });
      }
    }
    await insertChunked(tripRows, (chunk) => db.insert(trip).values(chunk));
    await insertChunked(tripDayTypeRows, (chunk) => db.insert(tripDayType).values(chunk));
    await insertChunked(stopTimeRows, (chunk) => db.insert(stopTime).values(chunk));

    const undo: StopEditUndo = async (undoNowMs) =>
      inTransaction(db, async () => {
        const [currentLine] = await selectLive(db, line, eq(line.id, created.line));
        const [currentPattern] = await selectLive(db, pattern, eq(pattern.id, created.pattern));
        if (!currentLine || !currentPattern) return { ok: false, reason: "stale" };
        if (currentLine.updatedAt !== nowMs || currentPattern.updatedAt !== nowMs) return { ok: false, reason: "stale" };
        if (!isLineUnused(await lineUsage(db, created.line))) return { ok: false, reason: "stale" };

        const deletedAt = Math.max(undoNowMs, nowMs + 1);
        await softDelete(db, line, [created.line], deletedAt);
        await softDelete(db, pattern, [created.pattern], deletedAt);
        await softDelete(db, patternStop, created.patternStop, deletedAt);
        await softDelete(db, timetable, [created.timetable], deletedAt);
        await softDelete(db, trip, created.trip, deletedAt);
        await softDelete(db, tripDayType, created.tripDayType, deletedAt);
        await softDelete(db, stopTime, created.stopTime, deletedAt);
        await softDelete(db, frequency, created.frequency, deletedAt);
        await softDelete(db, frequencyDayType, created.frequencyDayType, deletedAt);
        return { ok: true };
      });

    return { ok: true, lineId: created.line, patternId: created.pattern, tripCount: created.trip.length, undo };
  });
}
