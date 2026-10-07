/**
 * Avisos de saída e o histórico deles (E-06 §3.1, §6; D-101, D-103, D-105).
 *
 * Padrão do `places.ts`: uma transação por operação gravada, `uuidv7` do domínio, `updated_at` só muda quando algo
 * mudou de verdade, exclusão lógica. Quem precisa de relógio recebe o `at` (epoch ms) como argumento.
 * Sem fila nova: cada gravação é uma transação (a fila de uma gravação por vez é a mesma do `places.ts`).
 */
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { applyAlarm, uuidv7, type AlarmEventState, type AlarmReplacement, type AlarmRule, type SkipReason } from "@notebus/domain";
import { selectLive } from "./query";
import { alarmEvent, departureAlarm } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type AlarmRow = typeof departureAlarm.$inferSelect;
export type AlarmEventRow = typeof alarmEvent.$inferSelect;

export interface AlarmsDeps {
  newId?: (now: number) => string;
}

/** O aviso sem o `id`: quem grava dá o `id` (uuidv7). */
export type NewAlarm = Omit<AlarmRule, "id">;

export interface RecordEventInput {
  alarmId: string;
  plannedAt: number;
  serviceDate: string;
  tripId: string | null;
  state: AlarmEventState;
  skipReason?: SkipReason | null;
}

export interface EventPatch {
  state?: AlarmEventState;
  actedAt?: number | null;
  snoozedTo?: number | null;
}

export interface SaveAlarmResult {
  alarm: AlarmRow;
  /** Os avisos que perderam dias para o novo (D-105), para o toast "Substituiu o aviso das 07:59 nas segundas". */
  replaced: AlarmReplacement[];
  /** Desfaz: devolve os avisos antigos como estavam e apaga o novo (se ele foi criado agora). */
  undo: (at: number) => Promise<void>;
}

export function ruleOf(row: AlarmRow): AlarmRule {
  return {
    id: row.id,
    optionId: row.optionId,
    anchorTripId: row.anchorTripId,
    anchorBaseMinute: row.anchorBaseMinute,
    weekdays: [...row.weekdays],
    onceDate: row.onceDate,
    validFrom: row.validFrom,
    validTo: row.validTo,
    enabled: row.enabled,
  };
}

/** O aviso gravado já é esta regra? (compara só o que a regra tem). */
function sameRule(row: AlarmRow, rule: AlarmRule): boolean {
  const a = ruleOf(row);
  return (
    a.optionId === rule.optionId &&
    a.anchorTripId === rule.anchorTripId &&
    a.anchorBaseMinute === rule.anchorBaseMinute &&
    a.weekdays.join(",") === rule.weekdays.join(",") &&
    a.onceDate === rule.onceDate &&
    a.validFrom === rule.validFrom &&
    a.validTo === rule.validTo &&
    a.enabled === rule.enabled
  );
}

export function createAlarms(db: AnyDb, deps: AlarmsDeps = {}) {
  const newId = deps.newId ?? ((now: number) => uuidv7(now));
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

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

  // ─── Avisos ──────────────────────────────────────────────────────────────

  async function liveAlarms(): Promise<AlarmRow[]> {
    const rows = await selectLive(db, departureAlarm);
    return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Os avisos não apagados, ligados ou não. */
  function listAlarms(): Promise<AlarmRow[]> {
    return liveAlarms();
  }

  async function getAlarm(id: string): Promise<AlarmRow | null> {
    return (await liveAlarms()).find((a) => a.id === id) ?? null;
  }

  function rowOf(rule: AlarmRule, at: number): AlarmRow {
    return { ...rule, source: "user", createdAt: at, updatedAt: at, deletedAt: null };
  }

  /** Cria um aviso, sem mexer em nenhum outro (para o que não pede a D-105, como a importação). Use `saveAlarm` na tela. */
  function createAlarm(input: NewAlarm, at: number): Promise<AlarmRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const row = rowOf({ ...input, weekdays: [...input.weekdays], id: newId(at) }, at);
        await db.insert(departureAlarm).values(row);
        return row;
      }),
    );
  }

  /** Liga ou desliga um aviso. `updated_at` só muda se o estado mudou. */
  function setEnabled(id: string, enabled: boolean, at: number): Promise<AlarmRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const existing = await getAlarm(id);
        if (!existing) throw new Error("aviso não encontrado");
        if (existing.enabled === enabled) return existing;
        const updated: AlarmRow = { ...existing, enabled, updatedAt: at };
        await db.update(departureAlarm).set({ enabled, updatedAt: at }).where(eq(departureAlarm.id, id));
        return updated;
      }),
    );
  }

  /** Exclusão lógica (C2): o aviso some das listas e do agendamento, a linha fica. */
  function deleteAlarm(id: string, at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        const existing = await getAlarm(id);
        if (!existing) return;
        await db.update(departureAlarm).set({ deletedAt: at, updatedAt: at }).where(eq(departureAlarm.id, id));
      }),
    );
  }

  /**
   * Salva um aviso aplicando a D-105 (`applyAlarm`) **numa transação**: o novo substitui o antigo da mesma opção nos
   * dias em comum. Com `id` de um aviso existente, edita-o. Devolve o que foi substituído e o `undo`.
   */
  function saveAlarm(input: NewAlarm & { id?: string }, at: number): Promise<SaveAlarmResult> {
    return enqueue(() =>
      inTransaction(async () => {
        const before = await liveAlarms();
        const incoming: AlarmRule = { ...input, weekdays: [...input.weekdays], id: input.id ?? newId(at) };
        const { next, replaced } = applyAlarm(before.map(ruleOf), incoming);
        const byId = new Map(before.map((r) => [r.id, r]));
        let saved: AlarmRow | undefined;
        for (const rule of next) {
          const row = byId.get(rule.id);
          if (!row) {
            saved = rowOf(rule, at);
            await db.insert(departureAlarm).values(saved);
            continue;
          }
          if (sameRule(row, rule)) {
            if (rule.id === incoming.id) saved = row;
            continue;
          }
          const updated: AlarmRow = { ...row, ...rule, updatedAt: at };
          await db.update(departureAlarm).set(updated).where(eq(departureAlarm.id, rule.id));
          if (rule.id === incoming.id) saved = updated;
        }
        const created = !byId.has(incoming.id);
        const undo = (undoAt: number) =>
          enqueue(() =>
            inTransaction(async () => {
              for (const row of before) {
                await db.update(departureAlarm).set({ ...row, updatedAt: undoAt }).where(eq(departureAlarm.id, row.id));
              }
              if (created) {
                await db.update(departureAlarm).set({ deletedAt: undoAt, updatedAt: undoAt }).where(eq(departureAlarm.id, incoming.id));
              }
            }),
          );
        return { alarm: saved!, replaced, undo };
      }),
    );
  }

  // ─── Eventos (histórico, D-103) ─────────────────────────────────────────

  function recordEvent(input: RecordEventInput, at: number): Promise<AlarmEventRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const row: AlarmEventRow = {
          id: newId(at),
          alarmId: input.alarmId,
          plannedAt: input.plannedAt,
          serviceDate: input.serviceDate,
          tripId: input.tripId,
          state: input.state,
          skipReason: input.skipReason ?? null,
          actedAt: null,
          snoozedTo: null,
          source: "user",
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        await db.insert(alarmEvent).values(row);
        return row;
      }),
    );
  }

  /** Atualiza o estado do evento (o botão do aviso, a central de notificações). `updated_at` só muda se algo mudou. */
  function updateEvent(id: string, patch: EventPatch, at: number): Promise<AlarmEventRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const existing = (await selectLive(db, alarmEvent)).find((e) => e.id === id);
        if (!existing) throw new Error("evento não encontrado");
        const next = {
          state: patch.state ?? existing.state,
          actedAt: patch.actedAt !== undefined ? patch.actedAt : existing.actedAt,
          snoozedTo: patch.snoozedTo !== undefined ? patch.snoozedTo : existing.snoozedTo,
        };
        if (next.state === existing.state && next.actedAt === existing.actedAt && next.snoozedTo === existing.snoozedTo) return existing;
        await db.update(alarmEvent).set({ ...next, updatedAt: at }).where(eq(alarmEvent.id, id));
        return { ...existing, ...next, updatedAt: at };
      }),
    );
  }

  /** Os eventos, do mais antigo ao mais novo pela hora planejada; de um aviso só, se `alarmId`. */
  async function listEvents(alarmId?: string): Promise<AlarmEventRow[]> {
    const rows = await selectLive(db, alarmEvent);
    return rows.filter((e) => alarmId === undefined || e.alarmId === alarmId).sort((a, b) => a.plannedAt - b.plannedAt || (a.id < b.id ? -1 : 1));
  }

  return { listAlarms, getAlarm, createAlarm, setEnabled, deleteAlarm, saveAlarm, recordEvent, updateEvent, listEvents };
}

