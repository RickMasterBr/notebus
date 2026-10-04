/// <reference types="node" />
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { testDb } from "../db/testing/drizzleTestDb";
import { RECENT_STOPS_KEY, RECENT_STOPS_MAX, pushRecent, readRecentStops, rememberStop, writeRecentStops } from "./recentStops";

describe("pushRecent", () => {
  it("o mais recente fica no topo", () => {
    expect(pushRecent(["a"], "b")).toEqual(["b", "a"]);
  });
  it("repetir move para o topo, sem duplicar", () => {
    expect(pushRecent(["c", "b", "a"], "a")).toEqual(["a", "c", "b"]);
  });
  it("corta no limite (10) e solta o mais antigo", () => {
    expect(RECENT_STOPS_MAX).toBe(10);
    const full = ["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"];
    expect(pushRecent(full, "k")).toEqual(["k", "j", "i", "h", "g", "f", "e", "d", "c", "b"]);
  });
  it("com o limite cheio, repetir um antigo não solta ninguém", () => {
    const full = ["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"];
    expect(pushRecent(full, "a")).toEqual(["a", "j", "i", "h", "g", "f", "e", "d", "c", "b"]);
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

  it("guarda no máximo 10, o mais recente primeiro", async () => {
    const db = testDb();
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    for (const [i, id] of ids.entries()) await rememberStop(db, id, i);
    expect(await readRecentStops(db)).toEqual(["l", "k", "j", "i", "h", "g", "f", "e", "d", "c"]);
  });

  it("lista antiga de 3 continua valendo", async () => {
    const db = testDb();
    await db.insert(schema.setting).values({
      id: "s1", createdAt: 1, updatedAt: 1, source: "user", key: RECENT_STOPS_KEY, value: ["c", "b", "a"],
    });
    expect(await rememberStop(db, "d", 5)).toEqual(["d", "c", "b", "a"]);
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

describe("Limpar recentes (D-143)", () => {
  it("limpar esvazia a lista inteira e o Desfazer a devolve, na mesma ordem", async () => {
    const db = testDb();
    await rememberStop(db, "a", 1_000);
    await rememberStop(db, "b", 2_000);
    await rememberStop(db, "c", 3_000);
    const before = await readRecentStops(db);
    expect(before).toEqual(["c", "b", "a"]);
    // Limpar: a lista vira vazia (e o "Perto de você", que sai dos 3 primeiros dela, também).
    await writeRecentStops(db, [], 4_000);
    expect(await readRecentStops(db)).toEqual([]);
    // Desfazer: grava a lista de antes.
    await writeRecentStops(db, before, 5_000);
    expect(await readRecentStops(db)).toEqual(["c", "b", "a"]);
    // Uma linha só na tabela `setting`: limpar e desfazer atualizam, não duplicam.
    expect((await db.select().from(schema.setting)).filter((r) => r.key === RECENT_STOPS_KEY)).toHaveLength(1);
  });

  it("abrir um ponto depois de limpar recomeça a lista", async () => {
    const db = testDb();
    await rememberStop(db, "a", 1_000);
    await writeRecentStops(db, [], 2_000);
    expect(await rememberStop(db, "z", 3_000)).toEqual(["z"]);
  });
});

describe("Recentes depois de importar backup (E-03 bloco 4)", () => {
  it("ler recentes após gravação externa reflete a nova lista sem recriar o contexto", async () => {
    const db = testDb();
    expect(await readRecentStops(db)).toEqual([]);
    // Simula importação de backup gravando recent_stops na tabela setting
    await writeRecentStops(db, ["stop-1", "stop-2"], 10_000);
    // Leitura subsequente (como o reload() do RecentStopsProvider) obtém os dados importados
    expect(await readRecentStops(db)).toEqual(["stop-1", "stop-2"]);
  });
});
