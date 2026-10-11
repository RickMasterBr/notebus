/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { searchStops } from "@notebus/domain";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { loadStopIndex, shouldApplyReload } from "./stopIndex";

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

describe("loadStopIndex", () => {
  it("devolve os pontos com as linhas que passam neles", async () => {
    const { db } = await importedDb();
    const index = await loadStopIndex(db);
    expect(index.map((s) => [s.name, s.lines, s.externalId])).toEqual(
      expect.arrayContaining([
        ["Praça Inventada", ["1"], "9001"],
        ["Rua Exemplo", ["1"], null],
        ["Largo Fictício", ["1"], null],
      ]),
    );
    expect(index).toHaveLength(3);
  });

  it("alimenta a busca: apelido e ID", async () => {
    const { db } = await importedDb();
    const index = await loadStopIndex(db);
    expect(searchStops(index, "praca").map((s) => s.name)).toEqual(["Praça Inventada"]);
    expect(searchStops(index, "9001").map((s) => s.name)).toEqual(["Praça Inventada"]);
  });

  it("ponto apagado (exclusão lógica) e ponto sem linha: o primeiro some, o segundo fica sem linhas", async () => {
    const { db, sqlite } = await importedDb();
    sqlite.exec("UPDATE stop SET deleted_at = 1 WHERE name = 'Rua Exemplo'");
    sqlite.exec("UPDATE pattern_stop SET deleted_at = 1 WHERE position = 3");
    const index = await loadStopIndex(db);
    expect(index.map((s) => s.name).sort()).toEqual(["Largo Fictício", "Praça Inventada"]);
    expect(index.find((s) => s.name === "Largo Fictício")!.lines).toEqual([]);
  });

  describe("shouldApplyReload (descarte de resposta antiga)", () => {
    it("recarga lenta seguida de uma rápida: vale a última chamada", async () => {
      // Simula duas chamadas: chamada 1 (lenta) e chamada 2 (rápida)
      let latestApplied = 0;
      let currentState = "inicial";

      // Chamada 1 inicia: seq = 1
      const seq1 = 1;
      // Chamada 2 inicia: seq = 2
      const seq2 = 2;

      // Chamada 2 responde primeiro com "rapida"
      if (shouldApplyReload(seq2, latestApplied)) {
        latestApplied = seq2;
        currentState = "rapida";
      }
      expect(currentState).toBe("rapida");
      expect(latestApplied).toBe(2);

      // Chamada 1 responde depois com "lenta"
      if (shouldApplyReload(seq1, latestApplied)) {
        latestApplied = seq1;
        currentState = "lenta";
      }
      // Resposta da chamada 1 foi descartada! Permanece "rapida"
      expect(currentState).toBe("rapida");
      expect(latestApplied).toBe(2);
    });

    it("respostas em ordem crescente são aplicadas sucessivamente", () => {
      expect(shouldApplyReload(1, 0)).toBe(true);
      expect(shouldApplyReload(2, 1)).toBe(true);
      expect(shouldApplyReload(3, 2)).toBe(true);
      expect(shouldApplyReload(2, 3)).toBe(false);
      expect(shouldApplyReload(1, 3)).toBe(false);
    });
  });
});
