/**
 * Horário declarado (E-08 §4, TL-07, D-111): gravar o plano do domínio (`planDeclaration`) e desfazer.
 *
 * Molde do `calendarEdits.ts`: `source = user` e `official_key` nulo nos registros novos, `deleted_at` para apagar, uma
 * transação por gravação na fila do registro (`exclusive`), `uuidv7` do domínio. Quem precisa de relógio recebe `nowMs`.
 *
 * Como se grava (o domínio e o esquema não mudam):
 * - `update` sem `replaces`: entra um `stop_time` declarado na viagem.
 * - `update` com `replaces.origin = official` (D-111): o `stop_time` oficial passa a `official_edited` **e** `deleted_at`
 *   (a leitura `selectLive` o ignora; valor e origem ficam guardados na linha) e entra o declarado. Nada é sobrescrito.
 * - `update` com `replaces.origin = declared`: o declarado antigo é apagado logicamente e entra o novo.
 * - `create_partial`: uma viagem nova (`first = last = posição`) na tabela do percurso vigente hoje, um `trip_day_type` por
 *   tipo de dia sem casamento e um `stop_time` declarado.
 * O plano da tela é conferido de novo contra o banco dentro da transação (`stale` se a viagem mudou ou sumiu).
 *
 * Remover (`removeDeclared`, E-08 bloco 5, D10): o `stop_time` declarado recebe `deleted_at`; se ele tinha substituído um
 * horário oficial (a linha oficial está guardada com `official_edited` e `deleted_at`), o oficial **volta** (`deleted_at`
 * nulo, `source = official`, `origin` continua `official`: o declarar nunca muda `origin`); se o declarado era o único horário
 * de uma viagem parcial criada pelo Declarar (`source = user`, sem `official_key`), a viagem e os `trip_day_type`s também
 * recebem `deleted_at`. Um declarado antigo, apagado antes por outro declarar, nunca ressuscita.
 *
 * Depois de **qualquer** gravação ou `undo`, nesta ordem (como o `calendarEdits`): recarrega os horários (`reload`); recasa os
 * registros das datas cujo tipo de dia é um dos afetados (`rematch`; `manual` nunca é recasado, D-085); reagenda os avisos.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import {
  type CalendarData,
  type DayTypeCode,
  type DeclareStep,
  type DeclareTrip,
  dayTypeOf,
  lisbonWallClock,
  planDeclaration,
  uuidv7,
} from "@notebus/domain";
import { selectLive } from "./query";
import { dayType, patternStop, stopTime, timetable, trip, tripDayType } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface DeclaredTimesDeps<S extends { calendar: CalendarData }> {
  db: AnyDb;
  /** A fila de gravações do registro (`registro.exclusive`): uma transação por vez no mesmo banco. */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
  /** Recarrega os horários e devolve os novos; `null` se a leitura falhou (o recasamento fica para a próxima vez). */
  reload: () => Promise<S | null>;
  /** Recasa os registros das datas em que `changed` é verdadeiro, com os horários já recarregados. */
  rematch: (changed: (serviceDate: string) => boolean, fresh: S, nowMs: number) => Promise<unknown>;
  /** A regra única de reagendamento dos avisos (`scheduler.reschedule`). */
  reschedule: () => Promise<unknown>;
  newId?: (at: number) => string;
}

export type DeclareRefusal = "stale" | "no_steps" | "no_timetable" | "unknown_day_type";

/** O Desfazer: `stale` quando alguma linha já mudou depois da gravação (outra gravação); nada é apagado nesse caso. */
export type DeclaredUndo = (nowMs: number) => Promise<{ ok: true } | { ok: false; reason: "stale" }>;

export interface DeclareInput {
  /** O ponto físico onde se declara (para conferir o plano de novo). */
  stopId: string;
  serviceMinute: number;
  /** O plano que a tela mostrou (`planDeclaration`). */
  steps: readonly DeclareStep[];
}

export type DeclareResult = { ok: true; steps: DeclareStep[]; undo: DeclaredUndo } | { ok: false; reason: DeclareRefusal };

export interface RemoveDeclaredInput {
  stopId: string;
  patternId: string;
  tripId: string;
  /** A posição do ponto no percurso (a passagem tocada). */
  position: number;
  /** O horário que a tela mostrou; se a linha mudou depois, `stale`. */
  serviceMinute: number;
}

export type RemoveDeclaredResult =
  | { ok: true; restoredOfficialMinute: number | null; undo: DeclaredUndo }
  | { ok: false; reason: "stale" };

type Table = typeof stopTime | typeof trip | typeof tripDayType;

/** Uma linha que a gravação mexeu: o `updatedAt` que ela deixou e como devolvê-la. */
interface Touched {
  table: Table;
  id: string;
  targetUpdatedAt: number;
  restore: (at: number, current: { updatedAt: number }) => Promise<void>;
}

const DAY_TYPE_CODES: readonly string[] = ["weekday", "saturday", "sunday_holiday"];

/** A tabela do percurso em vigor hoje: `validFrom <= hoje` e `validTo` nulo ou `>= hoje`; a de `validFrom` mais recente. */
export function timetableInForce<T extends { validFrom: string; validTo: string | null }>(timetables: readonly T[], today: string): T | null {
  const inForce = timetables.filter((t) => t.validFrom <= today && (t.validTo === null || t.validTo >= today));
  return inForce.sort((a, b) => (a.validFrom < b.validFrom ? 1 : a.validFrom > b.validFrom ? -1 : 0))[0] ?? null;
}

export function createDeclaredTimes<S extends { calendar: CalendarData }>(deps: DeclaredTimesDeps<S>) {
  const { db } = deps;
  const newId = deps.newId ?? ((at: number) => uuidv7(at));

  async function inTransaction<T>(body: () => Promise<T>): Promise<T> {
    await db.run(sql`begin immediate`);
    try {
      const result = await body();
      await db.run(sql`commit`);
      return result;
    } catch (error) {
      await db.run(sql`rollback`).catch(() => undefined);
      throw error;
    }
  }

  async function afterChange(affected: ReadonlySet<DayTypeCode>, nowMs: number): Promise<void> {
    const fresh = await deps.reload();
    if (fresh) {
      const calendar = fresh.calendar;
      await deps.rematch((date) => affected.has(dayTypeOf(date, calendar).dayType), fresh, nowMs);
    }
    await deps.reschedule();
  }

  /** Os tipos de dia que a gravação mexeu: os marcados e os que a viagem atualizada também atende (`alsoAffects`). */
  const affectedDayTypes = (steps: readonly DeclareStep[]): Set<DayTypeCode> => {
    const set = new Set<DayTypeCode>();
    for (const s of steps) {
      set.add(s.dayType);
      if (s.action === "update") for (const d of s.alsoAffects) set.add(d);
    }
    return set;
  };

  /** Os dados do percurso como estão agora no banco, na forma que o domínio recebe. */
  async function readPattern(patternId: string) {
    const stops = await selectLive(db, patternStop, eq(patternStop.patternId, patternId));
    const timetables = await selectLive(db, timetable, eq(timetable.patternId, patternId));
    const ids = timetables.map((t) => t.id);
    const trips = ids.length === 0 ? [] : await selectLive(db, trip, inArray(trip.timetableId, ids));
    const tripIds = trips.map((t) => t.id);
    const links = tripIds.length === 0 ? [] : await selectLive(db, tripDayType, inArray(tripDayType.tripId, tripIds));
    const times = tripIds.length === 0 ? [] : await selectLive(db, stopTime, inArray(stopTime.tripId, tripIds));
    const dayTypes = await selectLive(db, dayType);
    const codeOf = new Map<string, DayTypeCode>();
    for (const d of dayTypes) if (DAY_TYPE_CODES.includes(d.code)) codeOf.set(d.id, d.code as DayTypeCode);
    const positionOf = new Map(stops.map((p) => [p.id, p.position]));
    const declareTrips: DeclareTrip[] = trips.map((t) => ({
      id: t.id,
      patternId,
      firstPosition: t.firstPosition,
      lastPosition: t.lastPosition,
      dayTypes: links.flatMap((l) => (l.tripId === t.id && codeOf.has(l.dayTypeId) ? [codeOf.get(l.dayTypeId)!] : [])),
      stopTimes: times.flatMap((st) => {
        const position = positionOf.get(st.patternStopId);
        return st.tripId === t.id && position !== undefined ? [{ position, serviceMinute: st.serviceMinute, origin: st.origin }] : [];
      }),
    }));
    return { stops, timetables, declareTrips, times, trips, codeOf, dayTypes };
  }

  /** O plano de novo, contra o banco agora; igual ao que a tela mostrou, senão `stale`. */
  async function replan(input: DeclareInput, patternId: string, position: number) {
    const data = await readPattern(patternId);
    const here = data.stops.find((p) => p.position === position);
    if (!here || here.stopId !== input.stopId) return null;
    const fresh = planDeclaration({
      patterns: [{ id: patternId, stops: data.stops.map((p) => ({ position: p.position, stopId: p.stopId, isTimepoint: p.isTimepoint })) }],
      trips: data.declareTrips,
      stopId: input.stopId,
      serviceMinute: input.serviceMinute,
      dayTypes: input.steps.map((s) => s.dayType),
      choice: { patternId, position },
    });
    if (!fresh.ok || JSON.stringify(fresh.steps) !== JSON.stringify(input.steps)) return null;
    return { data, here };
  }

  async function declare(input: DeclareInput, nowMs: number): Promise<DeclareResult> {
    const first = input.steps[0];
    if (!first) return { ok: false, reason: "no_steps" };
    const { patternId, position } = first;
    if (input.steps.some((s) => s.patternId !== patternId || s.position !== position)) return { ok: false, reason: "stale" };

    const touched: Touched[] = [];
    const result = await deps.exclusive(() =>
      inTransaction(async (): Promise<{ ok: true } | { ok: false; reason: DeclareRefusal }> => {
        const planned = await replan(input, patternId, position);
        if (!planned) return { ok: false, reason: "stale" };
        const { data, here } = planned;

        const insertDeclared = async (tripId: string) => {
          const id = newId(nowMs);
          await db.insert(stopTime).values({
            id, createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user", officialKey: null,
            tripId, patternStopId: here.id, serviceMinute: input.serviceMinute, origin: "declared",
          });
          touched.push({
            table: stopTime, id, targetUpdatedAt: nowMs,
            restore: async (at, current) => {
              await db.update(stopTime).set({ deletedAt: at, updatedAt: Math.max(at, current.updatedAt + 1) }).where(eq(stopTime.id, id));
            },
          });
        };

        // Um viagem que serve a vários tipos de dia marcados é gravada uma vez.
        const updatedTrips = new Set<string>();
        for (const step of input.steps) {
          if (step.action !== "update" || updatedTrips.has(step.tripId)) continue;
          updatedTrips.add(step.tripId);
          if (step.replaces) {
            const old = data.times.find((st) => st.tripId === step.tripId && st.patternStopId === here.id);
            if (!old) return { ok: false, reason: "stale" };
            const targetUpdatedAt = Math.max(nowMs, old.updatedAt + 1);
            const asOfficial = step.replaces.origin === "official";
            await db
              .update(stopTime)
              .set({ deletedAt: nowMs, updatedAt: targetUpdatedAt, source: asOfficial && old.source === "official" ? "official_edited" : old.source })
              .where(eq(stopTime.id, old.id));
            touched.push({
              table: stopTime, id: old.id, targetUpdatedAt,
              restore: async () => {
                await db.update(stopTime).set({ source: old.source, deletedAt: null, updatedAt: old.updatedAt }).where(eq(stopTime.id, old.id));
              },
            });
          }
          await insertDeclared(step.tripId);
        }

        const partials = input.steps.filter((s) => s.action === "create_partial");
        if (partials.length > 0) {
          const today = lisbonWallClock(nowMs).date;
          const table = timetableInForce(data.timetables, today);
          if (!table) return { ok: false, reason: "no_timetable" };
          const dayTypeIds = new Map<DayTypeCode, string>();
          for (const [id, code] of data.codeOf) dayTypeIds.set(code, id);
          if (partials.some((s) => !dayTypeIds.has(s.dayType))) return { ok: false, reason: "unknown_day_type" };

          const tripId = newId(nowMs);
          await db.insert(trip).values({
            id: tripId, createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user", officialKey: null,
            timetableId: table.id, firstPosition: position, lastPosition: position, seasonId: null, frequencyId: null,
          });
          touched.push({
            table: trip, id: tripId, targetUpdatedAt: nowMs,
            restore: async (at, current) => {
              await db.update(trip).set({ deletedAt: at, updatedAt: Math.max(at, current.updatedAt + 1) }).where(eq(trip.id, tripId));
            },
          });
          for (const step of partials) {
            const linkId = newId(nowMs);
            await db.insert(tripDayType).values({
              id: linkId, createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user", officialKey: null,
              tripId, dayTypeId: dayTypeIds.get(step.dayType)!,
            });
            touched.push({
              table: tripDayType, id: linkId, targetUpdatedAt: nowMs,
              restore: async (at, current) => {
                await db.update(tripDayType).set({ deletedAt: at, updatedAt: Math.max(at, current.updatedAt + 1) }).where(eq(tripDayType.id, linkId));
              },
            });
          }
          await insertDeclared(tripId);
        }
        return { ok: true };
      }),
    );
    if (!result.ok) return result;

    const affected = affectedDayTypes(input.steps);
    await afterChange(affected, nowMs);

    const undo: DeclaredUndo = async (at) => {
      const applied = await deps.exclusive(() =>
        inTransaction(async () => {
          // Tudo ou nada: se alguma linha mudou depois (outra gravação), nada é desfeito.
          const currents: { updatedAt: number }[] = [];
          for (const t of touched) {
            const row = (await db.select().from(t.table).where(eq(t.table.id, t.id)))[0];
            if (!row || row.updatedAt !== t.targetUpdatedAt) return false;
            currents.push(row);
          }
          for (const [i, t] of touched.entries()) await t.restore(at, currents[i]!);
          return true;
        }),
      );
      if (!applied) return { ok: false, reason: "stale" };
      await afterChange(affected, at);
      return { ok: true };
    };
    return { ok: true, steps: [...input.steps], undo };
  }

  async function removeDeclared(input: RemoveDeclaredInput, nowMs: number): Promise<RemoveDeclaredResult> {
    const touched: Touched[] = [];
    let restoredOfficialMinute: number | null = null;
    const affected = new Set<DayTypeCode>();

    /** Apagamento lógico de uma linha viva, com o `updatedAt` estritamente maior; o Desfazer devolve o estado exato. */
    const softDelete = async (table: typeof stopTime | typeof trip | typeof tripDayType, row: { id: string; updatedAt: number; deletedAt: number | null }) => {
      const targetUpdatedAt = Math.max(nowMs, row.updatedAt + 1);
      await db.update(table).set({ deletedAt: nowMs, updatedAt: targetUpdatedAt }).where(eq(table.id, row.id));
      touched.push({
        table, id: row.id, targetUpdatedAt,
        restore: async () => {
          await db.update(table).set({ deletedAt: row.deletedAt, updatedAt: row.updatedAt }).where(eq(table.id, row.id));
        },
      });
    };

    const result = await deps.exclusive(() =>
      inTransaction(async (): Promise<{ ok: true } | { ok: false; reason: "stale" }> => {
        const data = await readPattern(input.patternId);
        const here = data.stops.find((p) => p.position === input.position);
        if (!here || here.stopId !== input.stopId) return { ok: false, reason: "stale" };
        const live = data.times.find((st) => st.tripId === input.tripId && st.patternStopId === here.id);
        if (!live || live.origin !== "declared" || live.serviceMinute !== input.serviceMinute) return { ok: false, reason: "stale" };
        const theTrip = data.trips.find((t) => t.id === input.tripId);
        if (!theTrip) return { ok: false, reason: "stale" };

        const links = await selectLive(db, tripDayType, eq(tripDayType.tripId, theTrip.id));
        for (const l of links) {
          const code = data.codeOf.get(l.dayTypeId);
          if (code) affected.add(code);
        }

        await softDelete(stopTime, live);

        // O oficial que este declarado substituiu volta, exatamente como estava antes do declarar.
        const [replaced] = await db
          .select()
          .from(stopTime)
          .where(
            and(
              eq(stopTime.tripId, theTrip.id),
              eq(stopTime.patternStopId, here.id),
              eq(stopTime.origin, "official"),
              eq(stopTime.source, "official_edited"),
              isNotNull(stopTime.deletedAt),
            ),
          )
          .orderBy(desc(stopTime.updatedAt))
          .limit(1);
        if (replaced) {
          const targetUpdatedAt = Math.max(nowMs, replaced.updatedAt + 1, live.updatedAt + 1);
          await db
            .update(stopTime)
            .set({ deletedAt: null, source: "official", origin: "official", updatedAt: targetUpdatedAt })
            .where(eq(stopTime.id, replaced.id));
          touched.push({
            table: stopTime, id: replaced.id, targetUpdatedAt,
            restore: async () => {
              await db
                .update(stopTime)
                .set({ deletedAt: replaced.deletedAt, source: replaced.source, origin: replaced.origin, updatedAt: replaced.updatedAt })
                .where(eq(stopTime.id, replaced.id));
            },
          });
          restoredOfficialMinute = replaced.serviceMinute;
        }

        // Viagem parcial criada pelo Declarar que ficou sem nenhum horário vivo: some junto com os tipos de dia dela.
        const createdByDeclare = theTrip.source === "user" && theTrip.officialKey === null;
        if (createdByDeclare) {
          const remaining = data.times.filter((st) => st.tripId === theTrip.id && st.id !== live.id);
          if (remaining.length === 0 && !replaced) {
            await softDelete(trip, theTrip);
            for (const l of links) await softDelete(tripDayType, l);
          }
        }
        return { ok: true };
      }),
    );
    if (!result.ok) return result;

    await afterChange(affected, nowMs);

    const undo: DeclaredUndo = async (at) => {
      const applied = await deps.exclusive(() =>
        inTransaction(async () => {
          // Tudo ou nada: se alguma linha mudou depois, nada é desfeito.
          for (const t of touched) {
            const row = (await db.select().from(t.table).where(eq(t.table.id, t.id)))[0];
            if (!row || row.updatedAt !== t.targetUpdatedAt) return false;
          }
          for (const t of touched) await t.restore(at, { updatedAt: t.targetUpdatedAt });
          return true;
        }),
      );
      if (!applied) return { ok: false, reason: "stale" };
      await afterChange(affected, at);
      return { ok: true };
    };
    return { ok: true, restoredOfficialMinute, undo };
  }

  return { declare, removeDeclared };
}

export type DeclaredTimes<S extends { calendar: CalendarData }> = ReturnType<typeof createDeclaredTimes<S>>;
