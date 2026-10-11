/// <reference types="node" />
// E-08 item 2 (TL-07, T-75 a T-78, D-111): gravar o horário declarado e desfazer. Rede inventada (D-091).
import { type DayTypeCode, type DeclareTrip, dayTypeOf, passagesAtStop, planDeclaration } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { matchNetworkOf } from "../data/records";
import { createRegistro } from "../data/registro";
import { THURSDAY, exampleNetworkSeed, lineId, lisbon, stopId } from "../data/registroFixture";
import { type ScheduleSnapshot, loadSchedule } from "../data/schedule";
import { type DeclaredTimes, createDeclaredTimes } from "./declaredTimes";
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
  // A rede inventada só tem o tipo "dia útil"; a MOBILIS real tem os três.
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
    exclusive: registro.exclusive,
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

/** O plano como a tela o faz: sobre o horário em memória, só com o percurso da linha escolhida. */
function planFor(e: Env, o: { line: string; stop: "A" | "C" | "E" | "K"; minute: number; days: readonly DayTypeCode[]; position?: number }) {
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
    ...(o.position ? { choice: { patternId, position: o.position } } : {}),
  });
  if (!plan.ok) throw new Error(plan.reason);
  return { stopId: stopId(o.stop), serviceMinute: o.minute, steps: plan.steps };
}

async function declareOk(e: Env, o: Parameters<typeof planFor>[1], at: number) {
  const result = await e.declared.declare(planFor(e, o), at);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const C_0835 = { line: "1", stop: "C", minute: hm(8, 35), days: ["weekday"] } as const; // base 08:33,3 interpolada: +1,7
const C_0850 = { line: "1", stop: "C", minute: hm(8, 50), days: ["weekday"] } as const; // +16,7 e −13,3: não casa
const K_0852 = { line: "2", stop: "K", minute: hm(8, 52), days: ["weekday"] } as const; // oficial 08:50 (L2)

/** A viagem 08:10 da L1 passa a circular também no sábado (como 9 das 242 reais). */
async function alsoOnSaturday(e: Env) {
  await e.raw.run(
    "INSERT INTO trip_day_type (id, created_at, updated_at, source, trip_id, day_type_id) SELECT 'extra-sat', 1, 1, 'official', t.id, 'dt-sat' FROM trip t JOIN stop_time st ON st.trip_id = t.id WHERE st.service_minute = 490 AND st.pattern_stop_id IN (SELECT ps.id FROM pattern_stop ps JOIN pattern p ON p.id = ps.pattern_id JOIN line l ON l.id = p.line_id WHERE l.code = '1')",
    [],
  );
  e.state.current = await loadSchedule(e.db);
}

const liveTimes = (e: Env, line: string) =>
  e.rows(
    `SELECT st.service_minute AS minute, st.origin, st.source, st.trip_id, ps.position FROM stop_time st
     JOIN pattern_stop ps ON ps.id = st.pattern_stop_id JOIN pattern p ON p.id = ps.pattern_id JOIN line l ON l.id = p.line_id
     WHERE st.deleted_at IS NULL AND l.code = ? ORDER BY ps.position, st.service_minute`,
    [line],
  );
const count = (e: Env, table: string, where = "deleted_at IS NULL") => (e.rows(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0] as { n: number }).n;
const passageAt = (e: Env, line: string, stop: "A" | "C" | "E" | "K", tripFilter: (id: string) => boolean = () => true) => {
  const snap = e.state.current;
  const patternId = [...snap.patternLine].find(([, info]) => info.code === line)![0];
  return passagesAtStop(stopId(stop), snap.patterns.filter((p) => p.id === patternId), snap.trips.filter((t) => tripFilter(t.id)));
};

describe("T-75: horário que casa com a viagem que existe", () => {
  it("08:35 (+1,7 da 08:10, interpolada) vira stop_time declarado nela; nenhuma viagem nova", async () => {
    const e = await setup();
    const trips = count(e, "trip");
    const result = await declareOk(e, C_0835, NOW);
    expect(result.steps).toMatchObject([{ action: "update", replaces: null }]);
    expect(count(e, "trip")).toBe(trips);
    expect(e.rows("SELECT service_minute, origin, source, official_key, deleted_at, created_at, updated_at FROM stop_time WHERE origin = 'declared'")).toEqual([
      { service_minute: hm(8, 35), origin: "declared", source: "user", official_key: null, deleted_at: null, created_at: NOW, updated_at: NOW },
    ]);
  });

  it("depois do declare, o horário vem como declarado, com a incerteza ±3 de baseUncertainty.declared", async () => {
    const e = await setup();
    await declareOk(e, C_0835, NOW);
    const found = passageAt(e, "1", "C").filter((p) => p.base.kind === "declared");
    expect(found).toHaveLength(1);
    expect(found[0]!.base.minute).toBe(hm(8, 35));
    expect(found[0]!.expected.rangeStart).toBe(hm(8, 35) - 3);
    expect(found[0]!.expected.rangeEnd).toBe(hm(8, 35) + 3);
  });
});

describe("T-76: horário que não casa cria viagem parcial", () => {
  it("08:50 (+16,7 e −13,3): trip nova first = last = pos. 4, na tabela vigente, só em dia útil, com um stop_time declarado", async () => {
    const e = await setup();
    const before = count(e, "trip");
    await declareOk(e, C_0850, NOW);
    expect(count(e, "trip")).toBe(before + 1);
    const created = e.rows(
      `SELECT t.first_position AS first, t.last_position AS last, t.source, t.official_key, t.season_id, t.frequency_id, tt.valid_from, p.label
       FROM trip t JOIN timetable tt ON tt.id = t.timetable_id JOIN pattern p ON p.id = tt.pattern_id WHERE t.source = 'user'`,
    );
    expect(created).toEqual([{ first: 4, last: 4, source: "user", official_key: null, season_id: null, frequency_id: null, valid_from: "2026-01-01", label: "sentido 1" }]);
    expect(e.rows("SELECT d.code FROM trip_day_type l JOIN day_type d ON d.id = l.day_type_id JOIN trip t ON t.id = l.trip_id WHERE t.source = 'user'")).toEqual([{ code: "weekday" }]);
    expect(e.rows("SELECT service_minute, origin FROM stop_time WHERE origin = 'declared'")).toEqual([{ service_minute: hm(8, 50), origin: "declared" }]);
    const fresh = e.state.current;
    const partial = fresh.trips.find((t) => t.firstPosition === t.lastPosition)!;
    expect(fresh.schedule.trips.find((t) => t.id === partial.id)?.dayTypes).toEqual(["weekday"]);
    expect(passageAt(e, "1", "C").filter((p) => p.base.kind === "declared").map((p) => p.base.minute)).toEqual([hm(8, 50)]);
  });

  it("sem tabela em vigor hoje para o percurso: no_timetable, nada gravado", async () => {
    const e = await setup();
    await e.raw.run("UPDATE timetable SET valid_to = '2026-01-31'", []);
    const before = count(e, "trip");
    const result = await e.declared.declare(planFor(e, C_0850), NOW);
    expect(result).toEqual({ ok: false, reason: "no_timetable" });
    expect(count(e, "trip")).toBe(before);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(0);
  });
});

describe("T-77 e D-111: onde já há horário oficial", () => {
  it("08:52 sobre o oficial 08:50: o oficial vira official_edited e apagado (valor e origem guardados); o declarado vale; Desfazer devolve o oficial exatamente", async () => {
    const e = await setup();
    const official = e.rows("SELECT * FROM stop_time WHERE service_minute = 530 AND origin = 'official' AND trip_id IN (SELECT id FROM trip WHERE timetable_id IN (SELECT id FROM timetable WHERE pattern_id IN (SELECT id FROM pattern WHERE line_id = ?)))", [lineId("2")])[0]!;
    const result = await declareOk(e, K_0852, NOW);
    expect(result.steps).toMatchObject([{ action: "update", replaces: { origin: "official", serviceMinute: 530 } }]);

    const edited = e.rows("SELECT service_minute, origin, source, deleted_at FROM stop_time WHERE id = ?", [official.id as string])[0];
    expect(edited).toEqual({ service_minute: 530, origin: "official", source: "official_edited", deleted_at: NOW });
    expect(liveTimes(e, "2").filter((r) => r.position === 2)).toEqual([expect.objectContaining({ minute: hm(8, 52), origin: "declared", source: "user" })]);
    expect(passageAt(e, "2", "K")[0]!.base).toMatchObject({ minute: hm(8, 52), kind: "declared" });

    await expect(result.undo(NOW + 5000)).resolves.toEqual({ ok: true });
    const back = e.rows("SELECT * FROM stop_time WHERE id = ?", [official.id as string])[0];
    expect(back).toEqual({ ...official, deleted_at: null });
    expect({ minute: back!.service_minute, origin: back!.origin, source: back!.source, deleted: back!.deleted_at }).toEqual({ minute: 530, origin: "official", source: "official", deleted: null });
    expect(liveTimes(e, "2").filter((r) => r.position === 2)).toEqual([expect.objectContaining({ minute: 530, origin: "official" })]);
    expect(passageAt(e, "2", "K")[0]!.base).toMatchObject({ minute: 530, kind: "official" });
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(0);
  });
});

describe("T-78: dia útil e sábado no mesmo salvamento", () => {
  it("atualiza a viagem de dia útil e cria uma parcial para sábado; um só Desfazer desfaz as duas", async () => {
    const e = await setup();
    const trips = count(e, "trip");
    const result = await declareOk(e, { ...C_0835, days: ["weekday", "saturday"] }, NOW);
    expect(result.steps.map((s) => s.action)).toEqual(["update", "create_partial"]);
    expect(count(e, "trip")).toBe(trips + 1);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(2);
    expect(e.rows("SELECT d.code FROM trip_day_type l JOIN day_type d ON d.id = l.day_type_id JOIN trip t ON t.id = l.trip_id WHERE t.source = 'user'")).toEqual([{ code: "saturday" }]);

    await expect(result.undo(NOW + 1000)).resolves.toEqual({ ok: true });
    expect(count(e, "trip")).toBe(trips);
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(0);
    expect(count(e, "trip_day_type", "deleted_at IS NULL AND trip_id IN (SELECT id FROM trip WHERE source = 'user')")).toBe(0);
  });

  it("sábado e domingo sem casamento entram na MESMA parcial: uma trip, dois trip_day_type, um stop_time", async () => {
    const e = await setup();
    const trips = count(e, "trip");
    await declareOk(e, { ...C_0850, days: ["saturday", "sunday_holiday"] }, NOW);
    expect(count(e, "trip")).toBe(trips + 1);
    expect(e.rows("SELECT d.code FROM trip_day_type l JOIN day_type d ON d.id = l.day_type_id JOIN trip t ON t.id = l.trip_id WHERE t.source = 'user' ORDER BY d.code")).toEqual([
      { code: "saturday" },
      { code: "sunday_holiday" },
    ]);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(1);
  });

  it("a mesma viagem em dois tipos de dia marcados grava um stop_time só", async () => {
    const e = await setup();
    await alsoOnSaturday(e);
    const result = await declareOk(e, { ...C_0835, days: ["weekday", "saturday"] }, NOW);
    expect(result.steps).toMatchObject([{ action: "update", alsoAffects: [] }, { action: "update", alsoAffects: [] }]);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(1);
  });
});

describe("alsoAffects: o horário vale para a viagem inteira", () => {
  it("grava mesmo assim, avisa no plano, e o outro tipo de dia também recebe o horário", async () => {
    const e = await setup();
    await alsoOnSaturday(e);
    const result = await declareOk(e, C_0835, NOW);
    expect(result.steps).toMatchObject([{ action: "update", alsoAffects: ["saturday"] }]);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(1);
    expect(passageAt(e, "1", "C").some((p) => p.base.kind === "declared")).toBe(true);
  });
});

describe("declarar duas vezes o mesmo horário", () => {
  it("08:50 duas vezes: uma só parcial, atualizada; o stop_time declarado antigo é apagado logicamente", async () => {
    const e = await setup();
    const trips = count(e, "trip");
    await declareOk(e, C_0850, NOW);
    const second = await declareOk(e, C_0850, NOW + 1000);
    expect(second.steps).toMatchObject([{ action: "update", replaces: { origin: "declared", serviceMinute: hm(8, 50) } }]);
    expect(count(e, "trip")).toBe(trips + 1);
    expect(count(e, "stop_time", "origin = 'declared' AND deleted_at IS NULL")).toBe(1);
    expect(count(e, "stop_time", "origin = 'declared'")).toBe(2); // o antigo fica, apagado logicamente
  });

  it("Desfazer do segundo restaura o declarado anterior", async () => {
    const e = await setup();
    await declareOk(e, C_0850, NOW);
    const second = await declareOk(e, { ...C_0850, minute: hm(8, 51) }, NOW + 1000);
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared").map((r) => r.minute)).toEqual([hm(8, 51)]);
    await second.undo(NOW + 2000);
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared").map((r) => r.minute)).toEqual([hm(8, 50)]);
  });
});

describe("stale: o plano da tela é conferido contra o banco", () => {
  it("a viagem mudou entre a tela e o Salvar (outro declare): recusa e não grava", async () => {
    const e = await setup();
    const input = planFor(e, C_0835);
    await declareOk(e, { ...C_0835, minute: hm(8, 36) }, NOW); // outra gravação entra antes do Salvar
    const trips = count(e, "trip");
    const declaredBefore = liveTimes(e, "1").filter((r) => r.origin === "declared");
    expect(await e.declared.declare(input, NOW + 1000)).toEqual({ ok: false, reason: "stale" });
    expect(count(e, "trip")).toBe(trips);
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared")).toEqual(declaredBefore);
  });

  it("a viagem foi apagada entre a tela e o Salvar: recusa", async () => {
    const e = await setup();
    const input = planFor(e, C_0835);
    await e.raw.run("UPDATE trip SET deleted_at = 5 WHERE id IN (SELECT trip_id FROM stop_time WHERE service_minute = 490)", []);
    expect(await e.declared.declare(input, NOW)).toEqual({ ok: false, reason: "stale" });
  });

  it("plano vazio: no_steps", async () => {
    const e = await setup();
    expect(await e.declared.declare({ stopId: stopId("C"), serviceMinute: hm(8, 35), steps: [] }, NOW)).toEqual({ ok: false, reason: "no_steps" });
  });

  it("ponto que não é o da posição: stale", async () => {
    const e = await setup();
    const input = planFor(e, C_0835);
    expect(await e.declared.declare({ ...input, stopId: stopId("A") }, NOW)).toEqual({ ok: false, reason: "stale" });
  });
});

describe("Desfazer vencido (relógio parado): cada tipo de gravação, uma por uma", () => {
  it("update sem replaces: uma gravação nova por cima impede o Desfazer; a versão nova fica", async () => {
    const e = await setup();
    const first = await declareOk(e, C_0835, NOW);
    await declareOk(e, { ...C_0835, minute: hm(8, 36) }, NOW);
    expect(await first.undo(NOW)).toEqual({ ok: false, reason: "stale" });
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared").map((r) => r.minute)).toEqual([hm(8, 36)]);
  });

  it("replaces official: a gravação nova por cima impede o Desfazer; o oficial segue apagado e o declarado novo vale", async () => {
    const e = await setup();
    const first = await declareOk(e, K_0852, NOW);
    await declareOk(e, { ...K_0852, minute: hm(8, 53) }, NOW);
    expect(await first.undo(NOW)).toEqual({ ok: false, reason: "stale" });
    expect(liveTimes(e, "2").filter((r) => r.position === 2).map((r) => [r.minute, r.origin])).toEqual([[hm(8, 53), "declared"]]);
    expect(e.rows("SELECT deleted_at, source FROM stop_time WHERE service_minute = 530 AND origin = 'official'")).toEqual([{ deleted_at: NOW, source: "official_edited" }]);
  });

  it("replaces declared: a terceira gravação impede o Desfazer da segunda", async () => {
    const e = await setup();
    await declareOk(e, C_0835, NOW);
    const second = await declareOk(e, { ...C_0835, minute: hm(8, 36) }, NOW);
    await declareOk(e, { ...C_0835, minute: hm(8, 37) }, NOW);
    expect(await second.undo(NOW)).toEqual({ ok: false, reason: "stale" });
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared").map((r) => r.minute)).toEqual([hm(8, 37)]);
  });

  it("create_partial: declarar de novo por cima impede o Desfazer; a parcial fica", async () => {
    const e = await setup();
    const first = await declareOk(e, C_0850, NOW);
    await declareOk(e, { ...C_0850, minute: hm(8, 51) }, NOW);
    expect(await first.undo(NOW)).toEqual({ ok: false, reason: "stale" });
    expect(count(e, "trip", "source = 'user' AND deleted_at IS NULL")).toBe(1);
    expect(liveTimes(e, "1").filter((r) => r.origin === "declared").map((r) => r.minute)).toEqual([hm(8, 51)]);
  });

  it("recusa não dispara reload, rematch nem reschedule", async () => {
    const e = await setup();
    const first = await declareOk(e, C_0835, NOW);
    await declareOk(e, { ...C_0835, minute: hm(8, 36) }, NOW);
    e.state.calls.length = 0;
    await first.undo(NOW);
    expect(e.state.calls).toEqual([]);
  });
});

describe("depois de gravar e de desfazer: recarrega, recasa, reagenda (nesta ordem)", () => {
  it("o rematch vale só para as datas dos tipos de dia afetados", async () => {
    const e = await setup();
    const result = await declareOk(e, C_0835, NOW);
    expect(e.state.calls).toEqual(["reload", "rematch", "reschedule"]);
    const changed = e.state.lastChanged!;
    expect(dayTypeOf("2026-10-08", e.state.current.calendar).dayType).toBe("weekday");
    expect(changed("2026-10-08")).toBe(true); // quinta
    expect(changed("2026-10-10")).toBe(false); // sábado
    expect(changed("2026-10-11")).toBe(false); // domingo
    e.state.calls.length = 0;
    await result.undo(NOW + 1000);
    expect(e.state.calls).toEqual(["reload", "rematch", "reschedule"]);
  });

  it("um registro órfão da hora declarada passa a casar com a parcial nova (o recasamento da E-04)", async () => {
    const e = await setup();
    const token = await e.registro.board({ stopId: stopId("C"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:51") });
    await e.registro.refreshDeductions(NOW);
    const read = () => e.rows("SELECT match_status, trip_id FROM observation WHERE id = ?", [token.observationId]);
    expect(read()).toEqual([{ match_status: "orphan", trip_id: null }]);
    await declareOk(e, C_0850, NOW);
    const partialId = (e.rows("SELECT id FROM trip WHERE source = 'user'")[0] as { id: string }).id;
    expect(read()).toEqual([{ match_status: "auto", trip_id: partialId }]);
  });
});
