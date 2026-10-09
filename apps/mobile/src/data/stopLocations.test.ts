/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { clearStopLocation, saveStopLocation } from "../db/stopLocation";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { loadStopLocations } from "./stopLocations";

async function importedDb() {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, exampleSeed("2026-09-01"));
  return { db, sqlite };
}

describe("loadStopLocations", () => {
  it("só entram pontos com as duas coordenadas", async () => {
    const { db, sqlite } = await importedDb();
    expect(await loadStopLocations(db)).toEqual([]);
    sqlite.exec("UPDATE stop SET lat = 39.74 WHERE name = 'Rua Exemplo'");
    expect(await loadStopLocations(db)).toEqual([]);
    sqlite.exec("UPDATE stop SET lon = -8.8 WHERE name = 'Rua Exemplo'");
    const found = await loadStopLocations(db);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lat: 39.74, lon: -8.8 });
  });

  it("ponto apagado fica fora; guardar e limpar a localização aparecem na releitura, com a origem", async () => {
    const { db, sqlite } = await importedDb();
    const id = (sqlite.prepare("SELECT id FROM stop WHERE name = 'Praça Inventada'").get() as { id: string }).id;
    await saveStopLocation(db, id, { lat: 39.7, lon: -8.8 }, "suggested", 1000);
    expect(await loadStopLocations(db)).toEqual([{ id, lat: 39.7, lon: -8.8, source: "suggested" }]);
    await clearStopLocation(db, id, 2000);
    expect(await loadStopLocations(db)).toEqual([]);
    await saveStopLocation(db, id, { lat: 39.7, lon: -8.8 }, "manual", 3000);
    sqlite.exec(`UPDATE stop SET deleted_at = 1 WHERE id = '${id}'`);
    expect(await loadStopLocations(db)).toEqual([]);
  });
});
