/// <reference types="node" />
/**
 * Criação de linha no banco (E-08 §5.3, bloco 9, Item 3): T-84 e T-85 inteiros, tudo ou nada e Desfazer.
 * Rede inventada (nada da MOBILIS, D-091): 6 paragens, dias úteis e sábado.
 */
import { baseTimeAt, checkPatternPositions, checkTripTimes, officialId, type TripData } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { lineSeed } from "./testing/lineSeed";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { listLines } from "./networkList";
import { line, pattern, patternStop, stopTime, tables, trip } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000; // 2027-01-15 08:00 UTC
const S = officialId("mobilis/stop/S");
const A = officialId("mobilis/stop/A");
const E = officialId("mobilis/stop/E");
const K = officialId("mobilis/stop/K");

const NAMES = { S: "Estação Inventada", A: "Arrabalde Inventado", E: "Estádio Fictício", K: "Campus Exemplo" };

const seed = () =>
  lineSeed(NAMES, [
    {
      code: "1",
      color: "#7CB342",
      stops: [{ stop: "S", timepoint: true }, { stop: "A" }, { stop: "K", timepoint: true }],
      trips: [{ id: "0810", days: ["weekday", "saturday"], times: { 1: 490, 3: 520 } }],
    },
  ]);

async function setup(withNetwork = true) {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  if (withNetwork) await importMobilis(raw, seed());
  return { db, raw };
}
type Db = Awaited<ReturnType<typeof setup>>["db"];

const draft = (over: Partial<LineDraft> = {}): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [S, A, K] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  departures: [{ hour: 7, minute: 0 }],
  ...over,
});

const t84 = () =>
  draft({ departures: undefined, frequency: { fromMinute: 400, toMinute: 1180, headwayMinutes: 30 } });

const OWN_TABLES = ["line", "pattern", "patternStop", "timetable", "trip", "tripDayType", "stopTime", "frequency", "frequencyDayType"] as const;

/** Linhas (vivas e apagadas) de cada tabela da linha criada. */
async function counts(db: Db) {
  const out = {} as Record<(typeof OWN_TABLES)[number], { all: number; live: number }>;
  for (const name of OWN_TABLES) {
    const rows = await db.select().from(tables[name]);
    out[name] = { all: rows.length, live: rows.filter((r) => r.deletedAt === null).length };
  }
  return out;
}

async function tripData(db: Db, tripId: string): Promise<TripData> {
  const [row] = await db.select().from(trip).where(eq(trip.id, tripId));
  const times = await db.select().from(stopTime).where(eq(stopTime.tripId, tripId));
  const stops = await db.select().from(patternStop);
  const timetableRow = (await db.select().from(tables.timetable).where(eq(tables.timetable.id, row!.timetableId)))[0]!;
  return {
    id: tripId,
    patternId: timetableRow.patternId,
    firstPosition: row!.firstPosition,
    lastPosition: row!.lastPosition,
    stopTimes: times.map((t) => ({
      position: stops.find((s) => s.id === t.patternStopId)!.position,
      serviceMinute: t.serviceMinute,
      origin: t.origin,
    })),
  };
}

async function tripsOf(db: Db, patternId: string) {
  const [tt] = await db.select().from(tables.timetable).where(eq(tables.timetable.patternId, patternId));
  return db.select().from(trip).where(eq(trip.timetableId, tt!.id));
}

describe("createLine", () => {
  it("T-84: 06:40 a 19:40 a cada 30 → 27 viagens, 3 posições, horário lido pelo baseTimeAt do domínio", async () => {
    const { db } = await setup();
    const res = await createLine(db, t84(), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tripCount).toBe(27);

    const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, res.patternId));
    expect(stops.map((s) => s.position).sort()).toEqual([1, 2, 3]);
    expect(checkPatternPositions(stops.map((s) => s.position))).toBeNull();

    const trips = await tripsOf(db, res.patternId);
    expect(trips).toHaveLength(27);
    expect(trips.every((t) => t.frequencyId !== null && t.frequencyId === trips[0]!.frequencyId)).toBe(true);

    const datas = await Promise.all(trips.map((t) => tripData(db, t.id)));
    const sixForty = datas.find((d) => baseTimeAt(d, 1)?.minute === 400)!;
    expect(baseTimeAt(sixForty, 2)).toEqual({ position: 2, minute: 410, kind: "interpolated" }); // 06:50
    expect(baseTimeAt(sixForty, 3)).toEqual({ position: 3, minute: 420, kind: "official" }); // 07:00
    expect(datas.map((d) => baseTimeAt(d, 1)!.minute).sort((a, b) => a - b)).toEqual(Array.from({ length: 27 }, (_, i) => 400 + 30 * i));
    for (const d of datas) expect(checkTripTimes(d.stopTimes)).toBeNull();

    const [freq] = await db.select().from(tables.frequency);
    expect(freq).toMatchObject({
      patternId: res.patternId,
      refPatternStopId: stops.find((s) => s.position === 1)!.id,
      fromMinute: 400,
      toMinute: 1180,
      headwayMinutes: 30,
      source: "user",
      officialKey: null,
    });
    expect(trips[0]!.frequencyId).toBe(freq!.id);
    expect(await db.select().from(tables.frequencyDayType)).toHaveLength(1);
  });

  it("T-85: 22:00 a 00:30 a cada 30 → 6 viagens; as de 1440 e 1470 são do dia de serviço que começou antes", async () => {
    const { db } = await setup();
    const res = await createLine(
      db,
      draft({ departures: undefined, frequency: { fromMinute: 1320, toMinute: 30, headwayMinutes: 30 } }),
      NOW,
    );
    if (!res.ok) throw new Error(res.reason);
    expect(res.tripCount).toBe(6);

    const datas = await Promise.all((await tripsOf(db, res.patternId)).map((t) => tripData(db, t.id)));
    const firsts = datas.map((d) => baseTimeAt(d, 1)!.minute).sort((a, b) => a - b);
    expect(firsts).toEqual([1320, 1350, 1380, 1410, 1440, 1470]);
    expect(firsts.filter((m) => m >= 1440)).toEqual([1440, 1470]);
    expect((await db.select().from(tables.frequency))[0]!.toMinute).toBe(1470);
  });

  it("referência na 2ª paragem: a viagem sai antes e a frequência guarda a paragem da referência", async () => {
    const { db } = await setup();
    const res = await createLine(
      db,
      draft({ departures: undefined, frequency: { fromMinute: 410, toMinute: 470, headwayMinutes: 30, refPosition: 2 } }),
      NOW,
    );
    if (!res.ok) throw new Error(res.reason);
    const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, res.patternId));
    const [freq] = await db.select().from(tables.frequency);
    expect(freq!.refPatternStopId).toBe(stops.find((s) => s.position === 2)!.id);
    expect(freq!.fromMinute).toBe(410);
    const datas = await Promise.all((await tripsOf(db, res.patternId)).map((t) => tripData(db, t.id)));
    expect(datas.map((d) => baseTimeAt(d, 1)!.minute).sort((a, b) => a - b)).toEqual([400, 430, 460]);
  });

  it("horários avulsos: 3 viagens, a das 01:10 vira 1510, sem frequência", async () => {
    const { db } = await setup();
    const res = await createLine(
      db,
      draft({ departures: [{ hour: 7, minute: 30 }, { hour: 1, minute: 10 }, { hour: 18, minute: 0 }] }),
      NOW,
    );
    if (!res.ok) throw new Error(res.reason);
    expect(res.tripCount).toBe(3);
    const trips = await tripsOf(db, res.patternId);
    expect(trips.every((t) => t.frequencyId === null)).toBe(true);
    expect(await db.select().from(tables.frequency)).toHaveLength(0);
    expect(await db.select().from(tables.frequencyDayType)).toHaveLength(0);
    const firsts = (await Promise.all(trips.map((t) => tripData(db, t.id)))).map((d) => baseTimeAt(d, 1)!.minute).sort((a, b) => a - b);
    expect(firsts).toEqual([450, 1080, 1510]);
  });

  it("grava como linha sua: sem chave oficial, horários 'official' só na 1ª e na última, ponto de controle nas pontas", async () => {
    const { db } = await setup();
    const res = await createLine(db, draft({ dayTypeCodes: ["weekday", "saturday"] }), NOW);
    if (!res.ok) throw new Error(res.reason);

    const [row] = await db.select().from(line).where(eq(line.id, res.lineId));
    expect(row).toMatchObject({ code: "99", name: "Linha do Rick", color: "#1A73E8", source: "user", officialKey: null, createdAt: NOW, updatedAt: NOW, deletedAt: null });
    const [pat] = await db.select().from(pattern).where(eq(pattern.id, res.patternId));
    expect(pat).toMatchObject({ lineId: res.lineId, label: "sentido Campus", isCircular: false, source: "user" });

    const stops = (await db.select().from(patternStop).where(eq(patternStop.patternId, res.patternId))).sort((a, b) => a.position - b.position);
    expect(stops.map((s) => [s.stopId, s.isTimepoint])).toEqual([[S, true], [A, false], [K, true]]);

    const [tt] = await db.select().from(tables.timetable).where(eq(tables.timetable.patternId, res.patternId));
    expect(tt).toMatchObject({ datasetId: null, validFrom: "2027-01-15", validTo: null, source: "user" });

    const [t] = await tripsOf(db, res.patternId);
    expect(t).toMatchObject({ firstPosition: 1, lastPosition: 3 });
    const times = await db.select().from(stopTime).where(eq(stopTime.tripId, t!.id));
    expect(times.map((x) => [x.patternStopId, x.serviceMinute, x.origin]).sort()).toEqual(
      [[stops[0]!.id, 420, "official"], [stops[2]!.id, 440, "official"]].sort(),
    );
    expect(await db.select().from(tables.tripDayType).where(eq(tables.tripDayType.tripId, t!.id))).toHaveLength(2);
  });

  it("duas paragens (o mínimo) e paragem repetida (linha circular)", async () => {
    const { db } = await setup();
    const two = await createLine(db, draft({ code: "A1", pattern: { label: "p", stopIds: [S, K] } }), NOW);
    expect(two.ok).toBe(true);
    const circular = await createLine(db, draft({ code: "C1", pattern: { label: "volta", stopIds: [S, A, E, A, S], isCircular: true } }), NOW + 1);
    if (!circular.ok) throw new Error(circular.reason);
    const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, circular.patternId));
    expect(stops.map((s) => s.position).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(stops.filter((s) => s.stopId === A)).toHaveLength(2);
    expect((await db.select().from(pattern).where(eq(pattern.id, circular.patternId)))[0]!.isCircular).toBe(true);
  });

  it("listLines mostra a linha com 1 percurso e source user", async () => {
    const { db } = await setup();
    const res = await createLine(db, draft(), NOW);
    if (!res.ok) throw new Error(res.reason);
    expect((await listLines(db)).find((l) => l.id === res.lineId)).toMatchObject({ code: "99", patternCount: 1, source: "user" });
  });

  it("recusas: rascunho inválido, sem rede, código repetido, ponto desconhecido, tipo de dia desconhecido", async () => {
    const { db } = await setup();
    expect(await createLine(db, draft({ name: "" }), NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(await createLine(db, draft({ code: "1" }), NOW)).toEqual({ ok: false, reason: "duplicate_code" });
    expect(await createLine(db, draft({ pattern: { label: "p", stopIds: [S, "nao-existe"] } }), NOW)).toEqual({ ok: false, reason: "unknown_stop" });
    expect(await createLine(db, draft({ dayTypeCodes: ["sunday_holiday"] }), NOW)).toEqual({ ok: false, reason: "unknown_day_type" });
    const empty = await setup(false);
    expect(await createLine(empty.db, draft(), NOW)).toEqual({ ok: false, reason: "no_network" });
  });

  it("código repetido não diferencia maiúsculas; linha apagada não bloqueia o código", async () => {
    const { db } = await setup();
    const first = await createLine(db, draft({ code: "ab" }), NOW);
    if (!first.ok) throw new Error(first.reason);
    expect(await createLine(db, draft({ code: " AB " }), NOW + 1)).toEqual({ ok: false, reason: "duplicate_code" });
    expect((await first.undo(NOW + 2)).ok).toBe(true);
    expect((await createLine(db, draft({ code: "AB" }), NOW + 3)).ok).toBe(true);
  });

  it("ponto apagado conta como desconhecido", async () => {
    const { db } = await setup();
    await db.update(tables.stop).set({ deletedAt: 5 }).where(eq(tables.stop.id, K));
    expect(await createLine(db, draft(), NOW)).toEqual({ ok: false, reason: "unknown_stop" });
  });

  it("tudo ou nada: ponto desconhecido na última paragem não deixa nada pela metade", async () => {
    const { db } = await setup();
    const before = await counts(db);
    expect(await createLine(db, draft({ pattern: { label: "p", stopIds: [S, A, "nao-existe"] } }), NOW)).toEqual({ ok: false, reason: "unknown_stop" });
    expect(await counts(db)).toEqual(before);
  });

  it("tudo ou nada: falha no meio da gravação desfaz a linha, o percurso e o que já tinha entrado", async () => {
    const { db } = await setup();
    const before = await counts(db);
    let calls = 0;
    const newId = () => {
      calls += 1;
      if (calls > 12) throw new Error("falha no meio");
      return `id-${calls}`;
    };
    await expect(createLine(db, t84(), NOW, { newId })).rejects.toThrow("falha no meio");
    expect(await counts(db)).toEqual(before);
  });

  it("Desfazer apaga tudo que a criação gravou, com o mesmo deletedAt, e a linha some de listLines", async () => {
    const { db } = await setup();
    const before = await counts(db);
    const res = await createLine(db, t84(), NOW);
    if (!res.ok) throw new Error(res.reason);
    const created = await counts(db);
    expect(created.trip.live - before.trip.live).toBe(27);
    expect(created.stopTime.live - before.stopTime.live).toBe(54);

    expect(await res.undo(NOW + 10)).toEqual({ ok: true });

    const after = await counts(db);
    for (const name of OWN_TABLES) expect(after[name]!.live, name).toBe(before[name]!.live);
    for (const name of OWN_TABLES) expect(after[name]!.all, name).toBe(created[name]!.all);
    expect((await listLines(db)).some((l) => l.id === res.lineId)).toBe(false);

    const stamps = new Set<number | null>();
    for (const name of OWN_TABLES) {
      for (const r of await db.select().from(tables[name])) if (r.source === "user") stamps.add(r.deletedAt);
    }
    expect([...stamps]).toEqual([NOW + 10]);
  });

  it("Desfazer depois de mexer na linha, ou no percurso → stale, e nada muda", async () => {
    const { db } = await setup();
    const res = await createLine(db, t84(), NOW);
    if (!res.ok) throw new Error(res.reason);
    await db.update(line).set({ name: "Outro nome", updatedAt: NOW + 5 }).where(eq(line.id, res.lineId));
    const before = await counts(db);
    expect(await res.undo(NOW + 10)).toEqual({ ok: false, reason: "stale" });
    expect(await counts(db)).toEqual(before);

    const other = await createLine(db, draft({ code: "98" }), NOW + 20);
    if (!other.ok) throw new Error(other.reason);
    await db.update(pattern).set({ label: "mudou", updatedAt: NOW + 25 }).where(eq(pattern.id, other.patternId));
    expect(await other.undo(NOW + 30)).toEqual({ ok: false, reason: "stale" });
    expect((await counts(db)).line.live).toBe(before.line.live + 1);
  });

  it("Desfazer duas vezes: a segunda é stale", async () => {
    const { db } = await setup();
    const res = await createLine(db, draft(), NOW);
    if (!res.ok) throw new Error(res.reason);
    expect((await res.undo(NOW + 1)).ok).toBe(true);
    expect(await res.undo(NOW + 2)).toEqual({ ok: false, reason: "stale" });
  });
});
