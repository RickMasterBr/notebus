/// <reference types="node" />
// E-08 bloco 5, item 8 (D10): remover o horário declarado e desfazer. Rede inventada (D-091).
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

const dump = (e: Env) => ({
  stopTime: e.rows("SELECT * FROM stop_time ORDER BY id"),
  trip: e.rows("SELECT * FROM trip ORDER BY id"),
  tripDayType: e.rows("SELECT * FROM trip_day_type ORDER BY id"),
});

describe("removeDeclared: declarado que substituiu um oficial", () => {
  it("o oficial volta (deleted_at nulo, source official, origin official) e o declarado fica apagado", async () => {
    const e = await setup();
    const official = e.rows(
      "SELECT * FROM stop_time WHERE service_minute = ? AND origin = 'official' AND trip_id IN (SELECT id FROM trip WHERE timetable_id IN (SELECT id FROM timetable WHERE pattern_id IN (SELECT id FROM pattern WHERE line_id = ?)))",
      [OFFICIAL_K_0850, lineId("2")],
    )[0]!;
    await declareOk(e, K_0852, NOW);
    const result = await e.declared.removeDeclared(declaredInput(e, "K"), NOW + 1000);
    expect(result).toMatchObject({ ok: true, restoredOfficialMinute: OFFICIAL_K_0850 });
    const back = e.rows("SELECT service_minute, origin, source, deleted_at FROM stop_time WHERE id = ?", [official.id as string])[0];
    expect(back).toEqual({ service_minute: OFFICIAL_K_0850, origin: "official", source: "official", deleted_at: null });
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(0);
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NOT NULL")).toBe(1);
    expect(declaredPassageKeys(e.state.current.trips).size).toBe(0);
  });

  it("o Desfazer devolve o declarado e apaga o oficial de novo, com os updated_at antigos", async () => {
    const e = await setup();
    await declareOk(e, K_0852, NOW);
    const before = dump(e);
    const result = await e.declared.removeDeclared(declaredInput(e, "K"), NOW + 1000);
    if (!result.ok) throw new Error(result.reason);
    expect(dump(e)).not.toEqual(before);
    await expect(result.undo(NOW + 2000)).resolves.toEqual({ ok: true });
    expect(dump(e)).toEqual(before);
  });
});

describe("removeDeclared: viagem parcial criada pelo Declarar", () => {
  it("o único horário sai: a viagem e os trip_day_type somem junto; o selo some da leitura dos horários", async () => {
    const e = await setup();
    const trips = count(e, "trip");
    const links = count(e, "trip_day_type");
    await declareOk(e, C_0850, NOW);
    expect(count(e, "trip")).toBe(trips + 1);
    expect(declaredPassageKeys(e.state.current.trips).size).toBe(1);
    const result = await e.declared.removeDeclared(declaredInput(e, "C"), NOW + 1000);
    expect(result.ok).toBe(true);
    expect(count(e, "trip")).toBe(trips);
    expect(count(e, "trip_day_type")).toBe(links);
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(0);
    expect(declaredPassageKeys(e.state.current.trips).size).toBe(0);
  });

  it("a viagem não some quando ainda tem outro horário vivo", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const input = declaredInput(e, "C");
    const other = e.rows("SELECT id FROM pattern_stop WHERE pattern_id = ? AND position <> ? LIMIT 1", [input.patternId, input.position])[0]!;
    await e.raw.run(
      "INSERT INTO stop_time (id, created_at, updated_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES ('outro-vivo', 1, 1, 'user', ?, ?, 600, 'declared')",
      [input.tripId, other.id as string],
    );
    const result = await e.declared.removeDeclared(input, NOW + 1000);
    expect(result.ok).toBe(true);
    expect(e.rows("SELECT deleted_at FROM trip WHERE id = ?", [input.tripId])).toEqual([{ deleted_at: null }]);
    expect(count(e, "trip_day_type", `trip_id = '${input.tripId}' AND deleted_at IS NULL`)).toBe(1);
    expect(count(e, "stop_time", "id = 'outro-vivo' AND deleted_at IS NULL")).toBe(1);
  });

  it("Desfazer devolve viagem, tipos de dia e horário exatamente como estavam", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const before = dump(e);
    const result = await e.declared.removeDeclared(declaredInput(e, "C"), NOW + 1000);
    if (!result.ok) throw new Error(result.reason);
    await expect(result.undo(NOW + 2000)).resolves.toEqual({ ok: true });
    expect(dump(e)).toEqual(before);
  });
});

describe("removeDeclared: declarar de novo por cima do declarado", () => {
  it("remove só o vivo; o declarado antigo (apagado antes) não ressuscita", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    await declareOk(e, { ...C_0850, minute: hm(8, 51) }, NOW + 1000);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(2);
    const result = await e.declared.removeDeclared(declaredInput(e, "C", hm(8, 51)), NOW + 2000);
    expect(result).toMatchObject({ ok: true, restoredOfficialMinute: null });
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(0);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(2);
  });
});

describe("removeDeclared: stale", () => {
  it("o horário mudou depois que a tela abriu (outro declarar por cima): recusa e não grava", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const old = declaredInput(e, "C", hm(8, 50));
    await declareOk(e, { ...C_0850, minute: hm(8, 51) }, NOW + 1000);
    const before = dump(e);
    e.state.calls.length = 0;
    await expect(e.declared.removeDeclared(old, NOW + 2000)).resolves.toEqual({ ok: false, reason: "stale" });
    expect(dump(e)).toEqual(before);
    expect(e.state.calls).toEqual([]);
  });

  it("remover duas vezes: a segunda é stale", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const input = declaredInput(e, "C");
    expect((await e.declared.removeDeclared(input, NOW + 1000)).ok).toBe(true);
    await expect(e.declared.removeDeclared(input, NOW + 2000)).resolves.toEqual({ ok: false, reason: "stale" });
  });

  it("ponto que não é o da posição, ou horário que não é o vivo: stale", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const input = declaredInput(e, "C");
    await expect(e.declared.removeDeclared({ ...input, stopId: stopId("A") }, NOW + 1000)).resolves.toEqual({ ok: false, reason: "stale" });
    await expect(e.declared.removeDeclared({ ...input, serviceMinute: 1 }, NOW + 1000)).resolves.toEqual({ ok: false, reason: "stale" });
  });

  it("horário oficial (não declarado) nunca é removido por aqui: stale", async () => {
    const e = await setup();
    const official = e.rows(
      "SELECT st.trip_id, st.service_minute, ps.position, ps.pattern_id FROM stop_time st JOIN pattern_stop ps ON ps.id = st.pattern_stop_id WHERE st.origin = 'official' AND st.deleted_at IS NULL AND ps.stop_id = ? LIMIT 1",
      [stopId("A")],
    )[0]!;
    const input: RemoveDeclaredInput = { stopId: stopId("A"), patternId: official.pattern_id as string, tripId: official.trip_id as string, position: official.position as number, serviceMinute: official.service_minute as number };
    const before = dump(e);
    await expect(e.declared.removeDeclared(input, NOW)).resolves.toEqual({ ok: false, reason: "stale" });
    expect(dump(e)).toEqual(before);
  });

  it("Desfazer vencido: outra gravação mexeu numa linha tocada; nada é desfeito", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const result = await e.declared.removeDeclared(declaredInput(e, "C"), NOW + 1000);
    if (!result.ok) throw new Error(result.reason);
    await e.raw.run("UPDATE trip SET updated_at = updated_at + 1 WHERE source = 'user'", []);
    const before = dump(e);
    await expect(result.undo(NOW + 2000)).resolves.toEqual({ ok: false, reason: "stale" });
    expect(dump(e)).toEqual(before);
  });
});

describe("removeDeclared: updated_at estritamente crescente", () => {
  it("relógio parado: o updated_at da linha apagada fica maior que o anterior", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const input = declaredInput(e, "C");
    const sql = "SELECT updated_at FROM stop_time WHERE trip_id = ? AND origin = 'declared'";
    const before = e.rows(sql, [input.tripId])[0]!.updated_at as number;
    await e.declared.removeDeclared(input, NOW);
    expect(e.rows(sql, [input.tripId])[0]!.updated_at as number).toBeGreaterThan(before);
  });
});

describe("removeDeclared: recarrega, recasa, reagenda (nesta ordem), na remoção e no Desfazer", () => {
  it("o rematch vale só para as datas dos tipos de dia afetados", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    e.state.calls.length = 0;
    const result = await e.declared.removeDeclared(declaredInput(e, "C"), NOW + 1000);
    if (!result.ok) throw new Error(result.reason);
    expect(e.state.calls).toEqual(["reload", "rematch", "reschedule"]);
    const changed = e.state.lastChanged!;
    expect(dayTypeOf("2026-10-08", e.state.current.calendar).dayType).toBe("weekday");
    expect(changed("2026-10-08")).toBe(true);
    expect(changed("2026-10-10")).toBe(false);
    expect(changed("2026-10-11")).toBe(false);
    e.state.calls.length = 0;
    await result.undo(NOW + 2000);
    expect(e.state.calls).toEqual(["reload", "rematch", "reschedule"]);
  });
});
