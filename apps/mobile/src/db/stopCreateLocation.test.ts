/// <reference types="node" />
/**
 * Localização dentro de `createStop` (E-08 bloco 10, item 1, D-184): entra no mesmo INSERT, com o mesmo `updatedAt`,
 * para o Desfazer da criação continuar valendo. Ponto inválido não insere nada.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { exampleNetworkSeed } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { listStops } from "./networkList";
import { stop } from "./schema";
import { createStop } from "./stopCreate";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const LEIRIA = { lat: 39.7437, lon: -8.8071 };
const values = { name: "Ponto do Mapa", aliases: [], externalId: null, note: null };

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  return { db };
}

const rowOf = async (db: Awaited<ReturnType<typeof setup>>["db"], id: string) =>
  (await db.select().from(stop).where(eq(stop.id, id)))[0]!;

describe("createStop com localização (D-184)", () => {
  it("localização válida: grava lat, lon, locationSource manual e updatedAt igual a nowMs", async () => {
    const { db } = await setup();
    const res = await createStop(db, { ...values, location: LEIRIA }, NOW);
    if (!res.ok) throw new Error("criação falhou");
    expect(await rowOf(db, res.id)).toMatchObject({
      lat: LEIRIA.lat,
      lon: LEIRIA.lon,
      locationSource: "manual",
      source: "user",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("sem localização (ausente ou null): continua null, null, null", async () => {
    const { db } = await setup();
    for (const location of [undefined, null]) {
      const res = await createStop(db, { ...values, name: `Sem ${String(location)}`, location }, NOW);
      if (!res.ok) throw new Error("criação falhou");
      expect(await rowOf(db, res.id)).toMatchObject({ lat: null, lon: null, locationSource: null });
    }
  });

  it("localização inválida: falha invalid e nenhuma linha nova em stop", async () => {
    const { db } = await setup();
    const before = (await db.select().from(stop)).length;
    for (const location of [{ lat: 0, lon: 0 }, { lat: 91, lon: 0 }, { lat: 39.7, lon: Number.NaN }]) {
      expect(await createStop(db, { ...values, location }, NOW)).toEqual({ ok: false, reason: "invalid" });
    }
    expect((await db.select().from(stop)).length).toBe(before);
  });

  it("Desfazer de ponto criado com localização: ok e o ponto some das linhas vivas", async () => {
    const { db } = await setup();
    const res = await createStop(db, { ...values, location: LEIRIA }, NOW);
    if (!res.ok) throw new Error("criação falhou");
    expect((await listStops(db)).some((s) => s.id === res.id)).toBe(true);
    expect(await res.undo(NOW + 5)).toEqual({ ok: true });
    expect((await listStops(db)).some((s) => s.id === res.id)).toBe(false);
  });

  it("Desfazer depois de updatedAt alterado por fora: stale, e o ponto continua", async () => {
    const { db } = await setup();
    const res = await createStop(db, { ...values, location: LEIRIA }, NOW);
    if (!res.ok) throw new Error("criação falhou");
    await db.update(stop).set({ updatedAt: NOW + 50 }).where(eq(stop.id, res.id));
    expect(await res.undo(NOW + 100)).toEqual({ ok: false, reason: "stale" });
    expect((await listStops(db)).some((s) => s.id === res.id)).toBe(true);
  });
});
