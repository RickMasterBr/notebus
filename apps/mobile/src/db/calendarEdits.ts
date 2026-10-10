/**
 * Exceções de data e feriados do usuário (E-08 §3.3, UC-13, D-114): gravar, substituir, apagar e desfazer.
 *
 * Padrão do `places.ts` e do `alarms.ts`: `source = user`, `official_key` nulo, `deleted_at` para apagar, uma transação por
 * gravação na fila do registro (`exclusive`), `uuidv7` do domínio. Quem precisa de relógio recebe `nowMs` como argumento.
 *
 * Depois de **qualquer** gravação ou `undo`, três coisas acontecem, nesta ordem (E-08 §3.3):
 * 1. os horários são recarregados (`reload`): o calendário em memória passa a ter a mudança;
 * 2. os registros cuja data de serviço mudou de tipo de dia são recasados (`rematch`, com a regra de recálculo da E-04):
 *    `match_status = manual` nunca é recasado e a hora do registro nunca muda (D-085);
 * 3. os avisos de saída são reagendados (`reschedule`, E-06), porque feriados e exceções mudam os dias em que um aviso toca.
 */
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { type CalendarData, type DayTypeCode, dayTypeOf, uuidv7 } from "@notebus/domain";
import { selectLive } from "./query";
import { dateOverride, dayType, holiday, network } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface CalendarEditsDeps<S extends { calendar: CalendarData }> {
  db: AnyDb;
  /** A fila de gravações do registro (`registro.exclusive`): uma transação por vez no mesmo banco. */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
  /** O calendário carregado agora, antes da gravação (para saber que datas mudaram de tipo de dia). */
  calendar: () => CalendarData;
  /** Recarrega os horários e devolve os novos; `null` se a leitura falhou (o recasamento fica para a próxima vez). */
  reload: () => Promise<S | null>;
  /** Recasa os registros das datas em que `changed` é verdadeiro, com os horários já recarregados. */
  rematch: (changed: (serviceDate: string) => boolean, fresh: S, nowMs: number) => Promise<unknown>;
  /** A regra única de reagendamento dos avisos (`scheduler.reschedule`). */
  reschedule: () => Promise<unknown>;
  newId?: (at: number) => string;
}

export type UndoFn = (nowMs: number) => Promise<void>;

export type EditRefusal =
  | "invalid_date"
  | "empty_name"
  | "invalid_recurring"
  | "unknown_day_type"
  | "no_network"
  | "not_found"
  | "official";

export type Refused = { ok: false; reason: EditRefusal };

export interface SaveOverrideInput {
  date: string;
  dayTypeCode: DayTypeCode;
  note: string | null;
}

/** A exceção que estava na data antes (para o toast "Substituiu a exceção de 24/12"). */
export interface PreviousOverride {
  dayTypeCode: DayTypeCode;
  note: string | null;
}

export type SaveOverrideResult =
  | { ok: true; kind: "created" | "replaced"; id: string; previous: PreviousOverride | null; undo: UndoFn }
  | Refused;

export interface SaveHolidayInput {
  name: string;
  date: string;
  recurring: boolean;
}

export type SaveHolidayResult = { ok: true; id: string; undo: UndoFn } | Refused;
export type DeleteResult = { ok: true; undo: UndoFn } | Refused;

/** `AAAA-MM-DD` que existe no calendário (2027-02-30 não; 2028-02-29 sim). */
export function isRealDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

const DAY_TYPE_CODES: readonly string[] = ["weekday", "saturday", "sunday_holiday"];

export function createCalendarEdits<S extends { calendar: CalendarData }>(deps: CalendarEditsDeps<S>) {
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

  /** Grava na fila, numa transação, e só então faz as três consequências (a fila do registro não pode estar ocupada por nós). */
  async function commit<T>(write: () => Promise<T>, nowMs: number): Promise<T> {
    const before = deps.calendar();
    const result = await deps.exclusive(() => inTransaction(write));
    await afterChange(before, nowMs);
    return result;
  }

  async function afterChange(before: CalendarData, nowMs: number): Promise<void> {
    const fresh = await deps.reload();
    if (fresh) {
      const after = fresh.calendar;
      await deps.rematch((date) => dayTypeOf(date, before).dayType !== dayTypeOf(date, after).dayType, fresh, nowMs);
    }
    await deps.reschedule();
  }

  /** Como `commit`, mas para o `undo`: devolve o `UndoFn` pronto. */
  const undoOf = (restore: (nowMs: number) => Promise<void>): UndoFn => (nowMs) => commit(() => restore(nowMs), nowMs);

  const networkId = async (): Promise<string | null> => (await selectLive(db, network))[0]?.id ?? null;
  const dayTypeCodeOf = async (id: string): Promise<DayTypeCode | null> => {
    const code = (await selectLive(db, dayType)).find((d) => d.id === id)?.code;
    return code !== undefined && DAY_TYPE_CODES.includes(code) ? (code as DayTypeCode) : null;
  };

  // ─── Exceções de data ────────────────────────────────────────────────────

  /** Uma exceção por data: se já existe uma viva, ela é **substituída** (não duplica). */
  async function saveOverride(input: SaveOverrideInput, nowMs: number): Promise<SaveOverrideResult> {
    if (!isRealDate(input.date)) return { ok: false, reason: "invalid_date" };
    const dayTypeRow = (await selectLive(db, dayType)).find((d) => d.code === input.dayTypeCode);
    if (!dayTypeRow || !DAY_TYPE_CODES.includes(input.dayTypeCode)) return { ok: false, reason: "unknown_day_type" };
    const net = await networkId();
    if (net === null) return { ok: false, reason: "no_network" };
    const note = input.note === null || input.note.trim() === "" ? null : input.note.trim();

    return commit(async (): Promise<SaveOverrideResult> => {
      const existing = (await selectLive(db, dateOverride, eq(dateOverride.date, input.date)))[0];
      if (!existing) {
        const id = newId(nowMs);
        await db.insert(dateOverride).values({
          id, createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user", officialKey: null,
          networkId: net, date: input.date, dayTypeId: dayTypeRow.id, note,
        });
        return {
          ok: true, kind: "created", id, previous: null,
          undo: undoOf(async (at) => {
            await db.update(dateOverride).set({ deletedAt: at, updatedAt: at }).where(eq(dateOverride.id, id));
          }),
        };
      }
      const previous: PreviousOverride = { dayTypeCode: (await dayTypeCodeOf(existing.dayTypeId)) ?? "weekday", note: existing.note };
      await db
        .update(dateOverride)
        .set({ dayTypeId: dayTypeRow.id, note, updatedAt: nowMs, source: existing.source === "official" ? "official_edited" : existing.source })
        .where(eq(dateOverride.id, existing.id));
      return {
        ok: true, kind: "replaced", id: existing.id, previous,
        undo: undoOf(async (at) => {
          await db
            .update(dateOverride)
            .set({ dayTypeId: existing.dayTypeId, note: existing.note, source: existing.source, deletedAt: null, updatedAt: at })
            .where(eq(dateOverride.id, existing.id));
        }),
      };
    }, nowMs);
  }

  async function deleteOverride(id: string, nowMs: number): Promise<DeleteResult> {
    const existing = (await selectLive(db, dateOverride, eq(dateOverride.id, id)))[0];
    if (!existing) return { ok: false, reason: "not_found" };
    return commit(async (): Promise<DeleteResult> => {
      await db.update(dateOverride).set({ deletedAt: nowMs, updatedAt: nowMs }).where(eq(dateOverride.id, id));
      return {
        ok: true,
        undo: undoOf(async (at) => {
          await db.update(dateOverride).set({ deletedAt: null, updatedAt: at }).where(eq(dateOverride.id, id));
        }),
      };
    }, nowMs);
  }

  // ─── Feriados do usuário ─────────────────────────────────────────────────

  async function saveHoliday(input: SaveHolidayInput, nowMs: number): Promise<SaveHolidayResult> {
    if (!isRealDate(input.date)) return { ok: false, reason: "invalid_date" };
    if (typeof input.name !== "string" || input.name.trim() === "") return { ok: false, reason: "empty_name" };
    if (typeof input.recurring !== "boolean") return { ok: false, reason: "invalid_recurring" };
    const net = await networkId();
    if (net === null) return { ok: false, reason: "no_network" };

    return commit(async (): Promise<SaveHolidayResult> => {
      const id = newId(nowMs);
      await db.insert(holiday).values({
        id, createdAt: nowMs, updatedAt: nowMs, deletedAt: null, source: "user", officialKey: null,
        networkId: net, date: input.date, name: input.name.trim(), scope: "manual", recurring: input.recurring,
      });
      return {
        ok: true, id,
        undo: undoOf(async (at) => {
          await db.update(holiday).set({ deletedAt: at, updatedAt: at }).where(eq(holiday.id, id));
        }),
      };
    }, nowMs);
  }

  /** Só apaga feriado `manual`. O municipal do arquivo oficial não se apaga: a pessoa desliga o interruptor dos municipais. */
  async function deleteHoliday(id: string, nowMs: number): Promise<DeleteResult> {
    const existing = (await selectLive(db, holiday, eq(holiday.id, id)))[0];
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.scope !== "manual") return { ok: false, reason: "official" };
    return commit(async (): Promise<DeleteResult> => {
      await db.update(holiday).set({ deletedAt: nowMs, updatedAt: nowMs }).where(eq(holiday.id, id));
      return {
        ok: true,
        undo: undoOf(async (at) => {
          await db.update(holiday).set({ deletedAt: null, updatedAt: at }).where(eq(holiday.id, id));
        }),
      };
    }, nowMs);
  }

  return { saveOverride, deleteOverride, saveHoliday, deleteHoliday };
}

export type CalendarEdits<S extends { calendar: CalendarData }> = ReturnType<typeof createCalendarEdits<S>>;
