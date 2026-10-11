import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { stop } from "./schema";
import { saveStopEdit } from "./stopEdit";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_700_000_000_000;

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  return db;
}

const read = async (db: Awaited<ReturnType<typeof setup>>, id: string) =>
  (await db.select().from(stop).where(eq(stop.id, id)))[0]!;

describe("saveStopEdit: limite de 20 caracteres no ID externo (D9)", () => {
  it("20 caracteres salva; 21 devolve invalid e não grava", async () => {
    const db = await setup();
    const id = stopId("A");
    const { name } = await read(db, id);
    const empty = { name, aliases: [] as string[], note: null };
    expect((await saveStopEdit(db, id, { ...empty, externalId: "e".repeat(20) }, NOW)).ok).toBe(true);
    expect((await read(db, id)).externalId).toBe("e".repeat(20));
    expect(await saveStopEdit(db, id, { ...empty, externalId: "f".repeat(21) }, NOW + 10)).toEqual({ ok: false, reason: "invalid" });
    expect((await read(db, id)).externalId).toBe("e".repeat(20));
  });

  it("ponto com ID antigo longo continua salvável quando o ID não muda", async () => {
    const db = await setup();
    const id = stopId("A");
    const { name } = await read(db, id);
    const long = "L".repeat(30);
    await db.update(stop).set({ externalId: long }).where(eq(stop.id, id));
    const saved = await saveStopEdit(db, id, { name, aliases: [], externalId: long, note: "só a nota" }, NOW);
    expect(saved.ok).toBe(true);
    expect((await read(db, id)).externalId).toBe(long);
  });

  it("ID antigo longo trocado por outro com mais de 20 devolve invalid", async () => {
    const db = await setup();
    const id = stopId("A");
    const { name } = await read(db, id);
    await db.update(stop).set({ externalId: "L".repeat(30) }).where(eq(stop.id, id));
    expect(await saveStopEdit(db, id, { name, aliases: [], externalId: "M".repeat(30), note: null }, NOW)).toEqual({ ok: false, reason: "invalid" });
  });
});
