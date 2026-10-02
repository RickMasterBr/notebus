/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "./importMobilis";
import { listLines, listPatterns, listTrips, listTripTimes } from "./provisional";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { exampleSeed } from "./testing/exampleSeed";

async function importedDb(...versions: string[]) {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  for (const v of versions) await importMobilis(importDb, exampleSeed(v));
  return db;
}

describe("lista provisória", () => {
  it("linhas → percursos → viagens → horários do que foi importado", async () => {
    const db = await importedDb("2026-09-01");
    const lines = await listLines(db);
    expect(lines).toEqual([expect.objectContaining({ code: "1", name: "Linha Exemplo" })]);
    const patterns = await listPatterns(db, lines[0]!.id);
    expect(patterns.map((p) => p.label)).toEqual(["sentido Largo"]);
    const trips = await listTrips(db, patterns[0]!.id);
    expect(trips.map((t) => [t.firstMinute, t.dayTypes.sort()])).toEqual([
      [490, ["weekday"]],
      [540, ["saturday", "sunday_holiday"]],
    ]);
    const times = await listTripTimes(db, trips[0]!.id);
    expect(times.map((t) => [t.position, t.stopName, t.minute])).toEqual([
      [1, "Praça Inventada", 490],
      [2, "Rua Exemplo", 497],
      [3, "Largo Fictício", 504],
    ]);
  });

  it("só mostra o quadro em vigor: o fechado pela vigência nova (D-124) sai da lista", async () => {
    const db = await importedDb("2026-09-01", "2027-03-01");
    const [l] = await listLines(db);
    const patterns = await listPatterns(db, l!.id);
    // um percurso por vigência (chave com a vigência); só o da nova tem quadro aberto
    const withTrips = await Promise.all(patterns.map((p) => listTrips(db, p.id)));
    expect(withTrips.map((t) => t.length).sort()).toEqual([0, 2]);
  });
});
