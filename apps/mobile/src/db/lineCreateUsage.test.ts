/// <reference types="node" />
/**
 * Desfazer da criação de linha confere uso (E-08 bloco 10, item 4, T-129): se a linha nova já tem registro ou trajeto
 * vivos, o Desfazer responde `stale` e não apaga nada.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { listLines } from "./networkList";
import { line, observation, option, patternStop, tables } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const base = (id: string) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, source: "user" as const });

const draft = (): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [stopId("S"), stopId("A"), stopId("K")] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  frequency: { fromMinute: 400, toMinute: 580, headwayMinutes: 30 },
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
  const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, created.patternId));
  return { db, created, firstPatternStopId: stops.find((s) => s.position === 1)!.id };
}

const isListed = async (db: Awaited<ReturnType<typeof setup>>["db"], lineId: string) =>
  (await listLines(db)).some((l) => l.id === lineId);

describe("Desfazer de createLine confere uso (T-129)", () => {
  it("sem uso: desfaz normal e a linha some", async () => {
    const { db, created } = await setup();
    expect(await created.undo(NOW + 10)).toEqual({ ok: true });
    expect(await isListed(db, created.lineId)).toBe(false);
  });

  it("com um registro vivo da linha: stale e a linha continua viva", async () => {
    const { db, created } = await setup();
    await db.insert(observation).values({
      ...base("obs-1"),
      stopId: stopId("S"),
      lineId: created.lineId,
      observedAt: 1,
      kind: "boarded",
      mode: "live",
      recordedAt: 1,
    });
    expect(await created.undo(NOW + 10)).toEqual({ ok: false, reason: "stale" });
    expect(await isListed(db, created.lineId)).toBe(true);
    const [row] = await db.select().from(line).where(eq(line.id, created.lineId));
    expect(row).toMatchObject({ deletedAt: null, updatedAt: NOW });
    expect((await db.select().from(tables.trip)).filter((t) => t.deletedAt !== null)).toHaveLength(0);
  });

  it("com um trajeto vivo que embarca numa paragem da linha: stale e a linha continua viva", async () => {
    const { db, created, firstPatternStopId } = await setup();
    await db.insert(option).values({
      ...base("opt-1"),
      routeId: "route-x",
      kind: "bus",
      boardPatternStopId: firstPatternStopId,
      alightPatternStopId: null,
      sort: 0,
    });
    expect(await created.undo(NOW + 10)).toEqual({ ok: false, reason: "stale" });
    expect(await isListed(db, created.lineId)).toBe(true);
  });

  it("registro já apagado não conta como uso: desfaz normal", async () => {
    const { db, created } = await setup();
    await db.insert(observation).values({
      ...base("obs-2"),
      deletedAt: 5,
      stopId: stopId("S"),
      lineId: created.lineId,
      observedAt: 1,
      kind: "boarded",
      mode: "live",
      recordedAt: 1,
    });
    expect(await created.undo(NOW + 10)).toEqual({ ok: true });
  });
});
