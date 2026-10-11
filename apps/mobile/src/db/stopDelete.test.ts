/// <reference types="node" />
/**
 * Apagar ponto (E-08 §5.4, D-112, T-83, bloco 7, Item 2): só ponto seu e sem uso; uso só por linha apagada não conta.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { listStops } from "./networkList";
import { observation, option, pattern, patternStop, stop, walkTime } from "./schema";
import { createStop } from "./stopCreate";
import { deleteStop, stopUsage } from "./stopDelete";
import { saveStopEdit } from "./stopEdit";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const base = (id: string) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, source: "user" as const });

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  const created = await createStop(db, { name: "Meu ponto", aliases: [], externalId: null, note: null }, NOW);
  if (!created.ok) throw new Error("criação falhou");
  const mine = created.id;

  const addPatternStop = async (tag: string, stopOfPassage: string, patternDeleted = false) => {
    await db.insert(pattern).values({
      ...base(`pat-${tag}`),
      deletedAt: patternDeleted ? 5 : null,
      officialKey: null,
      lineId: "line-x",
      label: tag,
      isCircular: false,
    });
    await db.insert(patternStop).values({
      ...base(`ps-${tag}`),
      officialKey: null,
      patternId: `pat-${tag}`,
      position: 1,
      stopId: stopOfPassage,
      isTimepoint: false,
    });
    return `ps-${tag}`;
  };
  const addObservation = (tag: string, deletedAt: number | null = null) =>
    db.insert(observation).values({
      ...base(`obs-${tag}`),
      deletedAt,
      stopId: mine,
      lineId: "line-x",
      observedAt: 1,
      kind: "boarded",
      mode: "live",
      recordedAt: 1,
    });
  const addOption = (tag: string, board: string | null, alight: string | null) =>
    db.insert(option).values({
      ...base(`opt-${tag}`),
      routeId: "route-x",
      kind: "bus",
      boardPatternStopId: board,
      alightPatternStopId: alight,
      sort: 0,
    });
  return { db, mine, addPatternStop, addObservation, addOption };
}

describe("deleteStop (T-83)", () => {
  it("ponto oficial → official, e continua na lista", async () => {
    const { db } = await setup();
    expect(await deleteStop(db, stopId("A"), NOW + 1)).toEqual({ ok: false, reason: "official" });
    expect((await listStops(db)).some((s) => s.id === stopId("A"))).toBe(true);
  });

  it("ponto oficial editado → official", async () => {
    const { db } = await setup();
    const id = stopId("A");
    const original = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    await saveStopEdit(db, id, { name: original.name, aliases: ["Apelido"], externalId: null, note: null }, NOW + 1);
    expect((await db.select().from(stop).where(eq(stop.id, id)))[0]!.source).toBe("official_edited");
    expect(await deleteStop(db, id, NOW + 2)).toEqual({ ok: false, reason: "official" });
  });

  it("só conta como ponto seu o que tem source user e nenhuma chave oficial", async () => {
    const { db, mine } = await setup();
    await db.update(stop).set({ source: "official_edited" }).where(eq(stop.id, mine));
    expect(await deleteStop(db, mine, NOW + 1)).toEqual({ ok: false, reason: "official" });
    await db.update(stop).set({ source: "user", officialKey: "mobilis/stop/Z" }).where(eq(stop.id, mine));
    expect(await deleteStop(db, mine, NOW + 2)).toEqual({ ok: false, reason: "official" });
  });

  it("ponto que não existe, ou já apagado → not_found", async () => {
    const { db, mine } = await setup();
    expect(await deleteStop(db, "nada", NOW + 1)).toEqual({ ok: false, reason: "not_found" });
    expect((await deleteStop(db, mine, NOW + 2)).ok).toBe(true);
    expect(await deleteStop(db, mine, NOW + 3)).toEqual({ ok: false, reason: "not_found" });
  });

  it("ponto seu sem uso → apagado e some de listStops", async () => {
    const { db, mine } = await setup();
    expect(await stopUsage(db, mine)).toEqual({ patternStops: 0, observations: 0, walkTimes: 0, options: 0 });
    const res = await deleteStop(db, mine, NOW + 5);
    expect(res.ok).toBe(true);
    expect((await listStops(db)).some((s) => s.id === mine)).toBe(false);
  });

  it("ponto com 1 registro → in_use com observations: 1", async () => {
    const { db, mine, addObservation } = await setup();
    await addObservation("1");
    expect(await deleteStop(db, mine, NOW + 5)).toEqual({
      ok: false,
      reason: "in_use",
      usage: { patternStops: 0, observations: 1, walkTimes: 0, options: 0 },
    });
  });

  it("ponto com 1 tempo a pé → in_use com walkTimes: 1", async () => {
    const { db, mine } = await setup();
    await db
      .insert(walkTime)
      .values({ ...base("wt-1"), stopId: mine, placeId: "place-x", minutesMin: 4, minutesMax: null, origin: "manual" });
    expect(await deleteStop(db, mine, NOW + 5)).toMatchObject({ ok: false, reason: "in_use", usage: { walkTimes: 1 } });
  });

  it("tempo a pé apagado não conta", async () => {
    const { db, mine } = await setup();
    await db
      .insert(walkTime)
      .values({ ...base("wt-del"), deletedAt: 7, stopId: mine, placeId: "place-x", minutesMin: 4, minutesMax: null, origin: "manual" });
    expect((await stopUsage(db, mine)).walkTimes).toBe(0);
    expect((await deleteStop(db, mine, NOW + 5)).ok).toBe(true);
  });

  it("ponto numa paragem de percurso vivo → in_use com patternStops: 1", async () => {
    const { db, mine, addPatternStop } = await setup();
    await addPatternStop("a", mine);
    expect(await deleteStop(db, mine, NOW + 5)).toMatchObject({ ok: false, reason: "in_use", usage: { patternStops: 1 } });
  });

  it("ponto no embarque de uma opção de trajeto → in_use (a paragem e a opção contam)", async () => {
    const { db, mine, addPatternStop, addOption } = await setup();
    const passage = await addPatternStop("a", mine);
    await addOption("1", passage, null);
    expect(await deleteStop(db, mine, NOW + 5)).toMatchObject({
      ok: false,
      reason: "in_use",
      usage: { patternStops: 1, options: 1 },
    });
  });

  it("ponto no desembarque de uma opção de trajeto → in_use com options: 1", async () => {
    const { db, mine, addPatternStop, addOption } = await setup();
    const passage = await addPatternStop("a", mine);
    await addOption("1", "outra-passagem", passage);
    expect(await deleteStop(db, mine, NOW + 5)).toMatchObject({ ok: false, reason: "in_use", usage: { options: 1 } });
  });

  it("uso só por linha apagada não conta: percurso apagado, registro apagado", async () => {
    const { db, mine, addPatternStop, addObservation, addOption } = await setup();
    const deadPassage = await addPatternStop("dead", mine, true);
    await addOption("dead", deadPassage, null);
    await addObservation("dead", 9);
    expect(await stopUsage(db, mine)).toEqual({ patternStops: 0, observations: 0, walkTimes: 0, options: 0 });
    expect((await deleteStop(db, mine, NOW + 5)).ok).toBe(true);
  });

  it("opção apagada não conta", async () => {
    const { db, mine, addPatternStop } = await setup();
    const passage = await addPatternStop("a", mine);
    await db.insert(option).values({
      ...base("opt-del"),
      deletedAt: 3,
      routeId: "route-x",
      kind: "bus",
      boardPatternStopId: passage,
      alightPatternStopId: null,
      sort: 0,
    });
    expect((await stopUsage(db, mine)).options).toBe(0);
  });

  it("Desfazer devolve o estado exato: deletedAt nulo e updatedAt antigo", async () => {
    const { db, mine } = await setup();
    const before = (await db.select().from(stop).where(eq(stop.id, mine)))[0]!;
    const res = await deleteStop(db, mine, NOW + 5);
    if (!res.ok) throw new Error("apagar falhou");
    expect((await db.select().from(stop).where(eq(stop.id, mine)))[0]!.deletedAt).toBe(NOW + 5);
    expect(await res.undo(NOW + 6)).toEqual({ ok: true });
    expect((await db.select().from(stop).where(eq(stop.id, mine)))[0]).toEqual(before);
    expect((await listStops(db)).some((s) => s.id === mine)).toBe(true);
  });

  it("Desfazer depois de alguém mexer no ponto → stale, e o ponto continua apagado", async () => {
    const { db, mine } = await setup();
    const res = await deleteStop(db, mine, NOW + 5);
    if (!res.ok) throw new Error("apagar falhou");
    await db.update(stop).set({ updatedAt: NOW + 50 }).where(eq(stop.id, mine));
    expect(await res.undo(NOW + 60)).toEqual({ ok: false, reason: "stale" });
    expect((await listStops(db)).some((s) => s.id === mine)).toBe(false);
  });

  it("Desfazer duas vezes → a segunda é stale", async () => {
    const { db, mine } = await setup();
    const res = await deleteStop(db, mine, NOW + 5);
    if (!res.ok) throw new Error("apagar falhou");
    expect(await res.undo(NOW + 6)).toEqual({ ok: true });
    expect(await res.undo(NOW + 7)).toEqual({ ok: false, reason: "stale" });
  });
});
