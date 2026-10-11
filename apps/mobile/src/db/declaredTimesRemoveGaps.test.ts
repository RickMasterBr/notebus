/// <reference types="node" />
// E-08 bloco 6, item 0.2 e 0.3: lacunas da remoção do declarado (createdByDeclare e a ordem do oficial substituído). Rede inventada (D-091).
import { type DayTypeCode, type DeclareTrip, dayTypeOf, planDeclaration } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { matchNetworkOf } from "../data/records";
import { createRegistro } from "../data/registro";
import { THURSDAY, exampleNetworkSeed, lineId, lisbon, stopId } from "../data/registroFixture";
import { type ScheduleSnapshot, loadSchedule } from "../data/schedule";
import { declaredPassageKeys } from "../data/stopCard";
import { type DeclaredTimes, type RemoveDeclaredInput, createDeclaredTimes } from "./declaredTimes";
import { type ImportDb, importMobilis } from "./importMobilis";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = lisbon(THURSDAY, "18:00");
const hm = (h: number, m: number) => h * 60 + m;

/** Tudo ligado como no app: o horário em memória só muda quando o `reload` roda. */
async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  const net = (raw.all("SELECT id FROM network", []) as { id: string }[])[0]!.id;
  for (const [id, code, name, sort] of [["dt-sat", "saturday", "Sábado", 2], ["dt-sun", "sunday_holiday", "Domingo e feriado", 3]] as const) {
    await raw.run(
      "INSERT INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES (?, 1, 1, 'official', ?, ?, ?, ?, ?)",
      [id, `exemplo/${code}`, net, code, name, sort],
    );
  }
  let n = 0;
  const newId = () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}`;
  const state = { current: await loadSchedule(db), calls: [] as string[], lastChanged: null as ((d: string) => boolean) | null };
  const registro = createRegistro(db, { network: () => matchNetworkOf(state.current), snapshot: () => state.current, newId });
  const declared: DeclaredTimes<ScheduleSnapshot> = createDeclaredTimes<ScheduleSnapshot>({
    db,
    exclusive: (job) => registro.exclusive(job),
    reload: async () => {
      state.calls.push("reload");
      return (state.current = await loadSchedule(db));
    },
    rematch: async (changed, fresh, nowMs) => {
      state.calls.push("rematch");
      state.lastChanged = changed;
      return registro.rematchWhere(changed, matchNetworkOf(fresh), nowMs);
    },
    reschedule: async () => void state.calls.push("reschedule"),
    newId,
  });
  const rows = (sql: string, params: (string | number | null)[] = []) => raw.all(sql, params) as Record<string, unknown>[];
  return { raw, db, state, registro, declared, rows };
}

type Env = Awaited<ReturnType<typeof setup>>;

function planFor(e: Env, o: { line: string; stop: "A" | "C" | "E" | "K"; minute: number; days: readonly DayTypeCode[] }) {
  const snap = e.state.current;
  const patternId = [...snap.patternLine].find(([, info]) => info.code === o.line)![0];
  const dayTypesByTrip = new Map(snap.schedule.trips.map((t) => [t.id, t.dayTypes]));
  const trips: DeclareTrip[] = snap.trips.filter((t) => t.patternId === patternId).map((t) => ({ ...t, dayTypes: dayTypesByTrip.get(t.id) ?? [] }));
  const plan = planDeclaration({
    patterns: snap.patterns.filter((p) => p.id === patternId),
    trips,
    stopId: stopId(o.stop),
    serviceMinute: o.minute,
    dayTypes: o.days,
  });
  if (!plan.ok) throw new Error(plan.reason);
  return { stopId: stopId(o.stop), serviceMinute: o.minute, steps: plan.steps };
}

async function declareOk(e: Env, o: Parameters<typeof planFor>[1], at: number) {
  const result = await e.declared.declare(planFor(e, o), at);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const C_0850 = { line: "1", stop: "C", minute: hm(8, 50), days: ["weekday"] } as const;
const K_0852 = { line: "2", stop: "K", minute: hm(8, 52), days: ["weekday"] } as const;
const OFFICIAL_K_0850 = 530;

const count = (e: Env, table: string, where = "deleted_at IS NULL") => (e.rows(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0] as { n: number }).n;

/** O que a lista da folha entregaria à remoção: o declarado vivo de uma linha, no ponto. */
function declaredInput(e: Env, stop: "A" | "C" | "E" | "K", minute?: number): RemoveDeclaredInput {
  const row = e.rows(
    `SELECT st.trip_id, st.service_minute, ps.position, ps.pattern_id FROM stop_time st
     JOIN pattern_stop ps ON ps.id = st.pattern_stop_id
     WHERE st.origin = 'declared' AND st.deleted_at IS NULL AND ps.stop_id = ? ${minute === undefined ? "" : "AND st.service_minute = " + minute}
     ORDER BY st.created_at DESC`,
    [stopId(stop)],
  )[0]!;
  return { stopId: stopId(stop), patternId: row.pattern_id as string, tripId: row.trip_id as string, position: row.position as number, serviceMinute: row.service_minute as number };
}

const tripState = (e: Env, tripId: string) => ({
  trip: e.rows("SELECT deleted_at FROM trip WHERE id = ?", [tripId]),
  links: e.rows("SELECT deleted_at FROM trip_day_type WHERE trip_id = ?", [tripId]),
});

describe("removeDeclared: viagem oficial nunca some (0.2)", () => {
  it("oficial com um único horário vivo, o declarado: Remover não apaga a viagem nem os tipos de dia", async () => {
    const e = await setup();
    await declareOk(e, K_0852, NOW);
    const input = declaredInput(e, "K");
    const trip = e.rows("SELECT source, official_key FROM trip WHERE id = ?", [input.tripId])[0]!;
    expect(trip.source).toBe("official");
    expect(trip.official_key).not.toBeNull();
    await e.raw.run("DELETE FROM stop_time WHERE trip_id = ? AND NOT (origin = 'declared' AND deleted_at IS NULL)", [input.tripId]);
    expect(count(e, "stop_time", `trip_id = '${input.tripId}' AND deleted_at IS NULL`)).toBe(1);
    const links = count(e, "trip_day_type", `trip_id = '${input.tripId}'`);
    expect(links).toBeGreaterThan(0);

    const result = await e.declared.removeDeclared(input, NOW + 1000);
    expect(result).toMatchObject({ ok: true, restoredOfficialMinute: null });
    expect(tripState(e, input.tripId).trip).toEqual([{ deleted_at: null }]);
    expect(count(e, "trip_day_type", `trip_id = '${input.tripId}' AND deleted_at IS NULL`)).toBe(links);
  });
});

describe("removeDeclared: duas oficiais apagadas para a mesma viagem e parada (0.3)", () => {
  const original = (e: Env, tripId: string) =>
    e.rows("SELECT * FROM stop_time WHERE trip_id = ? AND origin = 'official' AND source = 'official_edited' AND deleted_at IS NOT NULL", [tripId])[0]!;

  async function addEditedCopy(e: Env, tripId: string, minute: number, updatedAt: number) {
    const o = original(e, tripId);
    await e.raw.run(
      "INSERT INTO stop_time (id, created_at, updated_at, deleted_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES (?, 1, ?, ?, 'official_edited', ?, ?, ?, 'official')",
      [`copia-${minute}`, updatedAt, o.deleted_at as number, tripId, o.pattern_stop_id as string, minute],
    );
    return o;
  }

  it("a de updated_at maior volta, mesmo inserida depois", async () => {
    const e = await setup();
    await declareOk(e, K_0852, NOW);
    const input = declaredInput(e, "K");
    const o = await addEditedCopy(e, input.tripId, 535, (original(e, input.tripId).updated_at as number) + 5000);
    expect(o.service_minute).toBe(OFFICIAL_K_0850);
    const result = await e.declared.removeDeclared(input, NOW + 10000);
    expect(result).toMatchObject({ ok: true, restoredOfficialMinute: 535 });
    expect(count(e, "stop_time", "id = 'copia-535' AND deleted_at IS NULL")).toBe(1);
    expect(count(e, "stop_time", `id = '${o.id as string}' AND deleted_at IS NULL`)).toBe(0);
  });

  it("a de updated_at menor não é escolhida, mesmo inserida depois", async () => {
    const e = await setup();
    await declareOk(e, K_0852, NOW);
    const input = declaredInput(e, "K");
    await addEditedCopy(e, input.tripId, 535, (original(e, input.tripId).updated_at as number) - 1);
    const result = await e.declared.removeDeclared(input, NOW + 10000);
    expect(result).toMatchObject({ ok: true, restoredOfficialMinute: OFFICIAL_K_0850 });
  });
});
