/// <reference types="node" />
/**
 * Apagar linha (E-08 §5.4, D-112, T-83 para linha, bloco 9, Item 4): só linha sua e sem uso; apaga tudo que ela criou.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { exampleNetworkSeed, lineId as officialLineId, stopId } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { deleteLine } from "./lineDelete";
import { lineUsage } from "./lineUsage";
import { listLines } from "./networkList";
import { line, observation, option, patternStop, tables } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const base = (id: string) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, source: "user" as const });

const OWN_TABLES = ["line", "pattern", "patternStop", "timetable", "trip", "tripDayType", "stopTime", "frequency", "frequencyDayType"] as const;

const draft = (over: Partial<LineDraft> = {}): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [stopId("S"), stopId("A"), stopId("K")] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  departures: undefined,
  frequency: { fromMinute: 400, toMinute: 580, headwayMinutes: 30 },
  ...over,
});

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  const created = await createLine(db, draft(), NOW);
  if (!created.ok) throw new Error(created.reason);
  const mine = created.lineId;

  const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, created.patternId));
  const passage = (position: number) => stops.find((s) => s.position === position)!.id;

  const addObservation = (tag: string, deletedAt: number | null = null, forLine = mine) =>
    db.insert(observation).values({
      ...base(`obs-${tag}`),
      deletedAt,
      stopId: stopId("S"),
      lineId: forLine,
      observedAt: 1,
      kind: "boarded",
      mode: "live",
      recordedAt: 1,
    });
  const addOption = (tag: string, board: string | null, alight: string | null, deletedAt: number | null = null) =>
    db.insert(option).values({
      ...base(`opt-${tag}`),
      deletedAt,
      routeId: "route-x",
      kind: "bus",
      boardPatternStopId: board,
      alightPatternStopId: alight,
      sort: 0,
    });
  return { db, mine, created, passage, addObservation, addOption };
}
type Db = Awaited<ReturnType<typeof setup>>["db"];

/** Todas as linhas (vivas e apagadas) das tabelas da linha, em ordem estável. */
async function dump(db: Db) {
  const out: Record<string, unknown[]> = {};
  for (const name of OWN_TABLES) {
    const rows = await db.select().from(tables[name]);
    out[name] = rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  return out;
}

const liveCounts = async (db: Db) => {
  const out = {} as Record<(typeof OWN_TABLES)[number], number>;
  for (const name of OWN_TABLES) out[name] = (await db.select().from(tables[name])).filter((r) => r.deletedAt === null).length;
  return out;
};

describe("deleteLine (T-83 para linha)", () => {
  it("linha oficial → official, e continua na lista", async () => {
    const { db } = await setup();
    expect(await deleteLine(db, officialLineId("1"), NOW + 1)).toEqual({ ok: false, reason: "official" });
    expect((await listLines(db)).some((l) => l.id === officialLineId("1"))).toBe(true);
  });

  it("linha oficial editada (nome ou cor) → official", async () => {
    const { db } = await setup();
    const id = officialLineId("1");
    await db.update(line).set({ source: "official_edited", name: "Outro nome" }).where(eq(line.id, id));
    expect(await deleteLine(db, id, NOW + 1)).toEqual({ ok: false, reason: "official" });
    await db.update(line).set({ source: "official_edited", color: "#000000" }).where(eq(line.id, id));
    expect(await deleteLine(db, id, NOW + 2)).toEqual({ ok: false, reason: "official" });
  });

  it("só conta como linha sua o que tem source user e nenhuma chave oficial", async () => {
    const { db, mine } = await setup();
    await db.update(line).set({ source: "official_edited" }).where(eq(line.id, mine));
    expect(await deleteLine(db, mine, NOW + 1)).toEqual({ ok: false, reason: "official" });
    await db.update(line).set({ source: "user", officialKey: "mobilis/line/Z" }).where(eq(line.id, mine));
    expect(await deleteLine(db, mine, NOW + 2)).toEqual({ ok: false, reason: "official" });
  });

  it("linha que não existe, ou já apagada → not_found", async () => {
    const { db, mine } = await setup();
    expect(await deleteLine(db, "nada", NOW + 1)).toEqual({ ok: false, reason: "not_found" });
    expect((await deleteLine(db, mine, NOW + 2)).ok).toBe(true);
    expect(await deleteLine(db, mine, NOW + 3)).toEqual({ ok: false, reason: "not_found" });
  });

  it("linha sua sem uso → apagada, some de listLines, e nada dela fica vivo; a rede oficial fica intacta", async () => {
    const { db, mine } = await setup();
    const before = await liveCounts(db);
    expect(before.trip).toBeGreaterThan(0);
    expect(await lineUsage(db, mine)).toEqual({ observations: 0, options: 0 });

    const res = await deleteLine(db, mine, NOW + 5);
    expect(res.ok).toBe(true);
    expect((await listLines(db)).some((l) => l.id === mine)).toBe(false);

    const after = await liveCounts(db);
    const officialTrips = 4; // L1 (2), L2 (1), L3 (1) da rede inventada
    expect(after.trip).toBe(officialTrips);
    expect(before.trip - after.trip).toBe(7); // 400 a 580 a cada 30 = 7 saídas
    expect(before.stopTime - after.stopTime).toBe(14);
    expect(before.patternStop - after.patternStop).toBe(3);
    expect(before.frequency - after.frequency).toBe(1);
    expect(before.frequencyDayType - after.frequencyDayType).toBe(1);
    expect(before.tripDayType - after.tripDayType).toBe(7);
    expect(before.timetable - after.timetable).toBe(1);
    expect(before.pattern - after.pattern).toBe(1);
    expect(before.line - after.line).toBe(1);
  });

  it("apaga tudo com o mesmo deletedAt", async () => {
    const { db, mine } = await setup();
    await deleteLine(db, mine, NOW + 5);
    const stamps = new Set<number | null>();
    for (const name of OWN_TABLES) {
      for (const r of await db.select().from(tables[name])) if (r.source === "user") stamps.add(r.deletedAt);
    }
    expect([...stamps]).toEqual([NOW + 5]);
  });

  it("linha com 1 registro → in_use com observations: 1, e nada é apagado", async () => {
    const { db, mine, addObservation } = await setup();
    await addObservation("1");
    const before = await dump(db);
    expect(await deleteLine(db, mine, NOW + 5)).toEqual({
      ok: false,
      reason: "in_use",
      usage: { observations: 1, options: 0 },
    });
    expect(await dump(db)).toEqual(before);
  });

  it("linha numa opção de trajeto: no embarque, ou na descida → in_use com options: 1", async () => {
    const boarding = await setup();
    await boarding.addOption("b", boarding.passage(1), null);
    expect(await deleteLine(boarding.db, boarding.mine, NOW + 5)).toEqual({
      ok: false,
      reason: "in_use",
      usage: { observations: 0, options: 1 },
    });

    const alighting = await setup();
    await alighting.addOption("a", null, alighting.passage(3));
    expect(await deleteLine(alighting.db, alighting.mine, NOW + 5)).toMatchObject({ ok: false, reason: "in_use", usage: { options: 1 } });
  });

  it("uma opção que embarca e desce na mesma linha conta uma vez", async () => {
    const { db, mine, passage, addOption } = await setup();
    await addOption("both", passage(1), passage(3));
    expect(await lineUsage(db, mine)).toEqual({ observations: 0, options: 1 });
  });

  it("uso só por registro ou opção apagados não conta", async () => {
    const { db, mine, passage, addObservation, addOption } = await setup();
    await addObservation("del", 7);
    await addOption("del", passage(1), passage(3), 7);
    expect(await lineUsage(db, mine)).toEqual({ observations: 0, options: 0 });
    expect((await deleteLine(db, mine, NOW + 5)).ok).toBe(true);
  });

  it("registro de outra linha não bloqueia", async () => {
    const { db, mine, addObservation } = await setup();
    await addObservation("outra", null, officialLineId("1"));
    expect((await deleteLine(db, mine, NOW + 5)).ok).toBe(true);
  });

  it("Desfazer devolve todas as linhas como estavam (deletedAt e updatedAt)", async () => {
    const { db, mine } = await setup();
    const before = await dump(db);
    const res = await deleteLine(db, mine, NOW + 5);
    if (!res.ok) throw new Error(res.reason);
    expect(await dump(db)).not.toEqual(before);

    expect(await res.undo(NOW + 6)).toEqual({ ok: true });

    expect(await dump(db)).toEqual(before);
    expect((await listLines(db)).some((l) => l.id === mine)).toBe(true);
  });

  it("Desfazer depois de editar a linha → stale, e continua apagada", async () => {
    const { db, mine } = await setup();
    const res = await deleteLine(db, mine, NOW + 5);
    if (!res.ok) throw new Error(res.reason);
    await db.update(line).set({ updatedAt: NOW + 9 }).where(eq(line.id, mine));
    expect(await res.undo(NOW + 10)).toEqual({ ok: false, reason: "stale" });
    expect((await listLines(db)).some((l) => l.id === mine)).toBe(false);
    expect((await liveCounts(db)).trip).toBe(4);
  });
});
