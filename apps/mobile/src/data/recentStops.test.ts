/// <reference types="node" />
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { testDb } from "../db/testing/drizzleTestDb";
import { RECENT_STOPS_KEY, RECENT_STOPS_MAX, pushRecent, readRecentStops, rememberStop } from "./recentStops";

describe("pushRecent", () => {
  it("o mais recente fica no topo", () => {
    expect(pushRecent(["a"], "b")).toEqual(["b", "a"]);
  });
  it("repetir move para o topo, sem duplicar", () => {
    expect(pushRecent(["c", "b", "a"], "a")).toEqual(["a", "c", "b"]);
  });
  it("corta no limite (3) e solta o mais antigo", () => {
    expect(RECENT_STOPS_MAX).toBe(3);
    expect(pushRecent(["c", "b", "a"], "d")).toEqual(["d", "c", "b"]);
  });
  it("não altera a lista de entrada", () => {
    const list = ["a", "b"];
    pushRecent(list, "c");
    expect(list).toEqual(["a", "b"]);
  });
});

describe("últimos pontos na tabela setting", () => {
  it("banco novo: lista vazia", async () => {
    expect(await readRecentStops(testDb())).toEqual([]);
  });

  it("grava, mantém a ordem e usa uma linha só", async () => {
    const db = testDb();
    await rememberStop(db, "a", 10);
    await rememberStop(db, "b", 20);
    expect(await rememberStop(db, "a", 30)).toEqual(["a", "b"]);
    expect(await readRecentStops(db)).toEqual(["a", "b"]);
    const rows = await db.select().from(schema.setting);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe(RECENT_STOPS_KEY);
    expect(rows[0]!.updatedAt).toBe(30);
  });

  it("guarda no máximo 3", async () => {
    const db = testDb();
    for (const [i, id] of ["a", "b", "c", "d"].entries()) await rememberStop(db, id, i);
    expect(await readRecentStops(db)).toEqual(["d", "c", "b"]);
  });

  it("valor estragado ou apagado é tratado como lista vazia", async () => {
    const db = testDb();
    await db.insert(schema.setting).values({
      id: "s1", createdAt: 1, updatedAt: 1, source: "user", key: RECENT_STOPS_KEY, value: { nao: "lista" },
    });
    expect(await readRecentStops(db)).toEqual([]);
    expect(await rememberStop(db, "a", 5)).toEqual(["a"]);
  });

  it("linha apagada (exclusão lógica) volta a valer ao gravar", async () => {
    const db = testDb();
    await db.insert(schema.setting).values({
      id: "s1", createdAt: 1, updatedAt: 1, deletedAt: 2, source: "user", key: RECENT_STOPS_KEY, value: ["velho"],
    });
    expect(await readRecentStops(db)).toEqual([]);
    expect(await rememberStop(db, "a", 5)).toEqual(["a"]);
    expect(await readRecentStops(db)).toEqual(["a"]);
  });
});
