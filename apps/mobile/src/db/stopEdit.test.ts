/// <reference types="node" />
/**
 * Testes de banco para edição de ponto (E-08 §5.1, D-113, Item 2).
 * Gravar e Desfazer, controle de concorrência por updatedAt estritamente crescente e ida e volta do backup (T-82).
 */
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { importBackup, readBackupInput } from "./backup";
import { type ImportDb, importMobilis } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { saveStopLocation } from "./stopLocation";
import { saveStopEdit } from "./stopEdit";
import { stop } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_700_000_000_000;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  const rows = (sql: string, params: (string | number | null)[] = []) =>
    raw.all(sql, params) as Record<string, unknown>[];
  return { db, raw, rows };
}

describe("stopEdit (Item 2: Gravar e Desfazer no banco)", () => {
  it("gravar apelido num ponto oficial vira official_edited e o Desfazer devolve official com o updatedAt antigo", async () => {
    const { db } = await setup();
    const id = stopId("A"); // Arrabalde (oficial)
    const original = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(original.source).toBe("official");
    expect(original.aliases).toEqual([]);

    const result = await saveStopEdit(
      db,
      id,
      {
        name: original.name,
        aliases: ["Shopping"],
        externalId: original.externalId,
        note: original.note,
      },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edited = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(edited.source).toBe("official_edited");
    expect(edited.aliases).toEqual(["Shopping"]);
    expect(edited.updatedAt).toBe(Math.max(NOW, original.updatedAt + 1));

    // Desfazer restaura estado original
    const undoRes = await result.undo(NOW + 5000);
    expect(undoRes).toEqual({ ok: true });

    const restored = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(restored.source).toBe("official");
    expect(restored.aliases).toEqual([]);
    expect(restored.updatedAt).toBe(original.updatedAt);
  });

  it("ponto user continua user após salvar e após desfazer", async () => {
    const { db } = await setup();
    // Criar um ponto do usuário
    const userStopId = "user-stop-1";
    await db.insert(stop).values({
      id: userStopId,
      createdAt: 100,
      updatedAt: 100,
      deletedAt: null,
      source: "user",
      officialKey: null,
      networkId: "net-1",
      name: "Meu Ponto",
      aliases: [],
      externalId: null,
      note: null,
    });

    const res = await saveStopEdit(
      db,
      userStopId,
      {
        name: "Meu Ponto Editado",
        aliases: ["Ponto Novo"],
        externalId: "9999",
        note: "Nota do ponto",
      },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const afterSave = (await db.select().from(stop).where(eq(stop.id, userStopId)))[0]!;
    expect(afterSave.source).toBe("user");
    expect(afterSave.name).toBe("Meu Ponto Editado");

    const undoRes = await res.undo(NOW + 1000);
    expect(undoRes).toEqual({ ok: true });

    const afterUndo = (await db.select().from(stop).where(eq(stop.id, userStopId)))[0]!;
    expect(afterUndo.source).toBe("user");
    expect(afterUndo.name).toBe("Meu Ponto");
    expect(afterUndo.updatedAt).toBe(100);
  });

  it("duas gravações no mesmo milissegundo (relógio parado) dão updatedAt estritamente crescente", async () => {
    const { db } = await setup();
    const id = stopId("C");

    const res1 = await saveStopEdit(
      db,
      id,
      { name: "Largo Um", aliases: ["Apelido 1"], externalId: null, note: null },
      NOW,
    );
    expect(res1.ok).toBe(true);
    const row1 = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;

    const res2 = await saveStopEdit(
      db,
      id,
      { name: "Largo Um", aliases: ["Apelido 2"], externalId: null, note: null },
      NOW, // relógio parado no mesmo milissegundo
    );
    expect(res2.ok).toBe(true);
    const row2 = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;

    expect(row2.updatedAt).toBeGreaterThan(row1.updatedAt);
    expect(row2.updatedAt).toBe(row1.updatedAt + 1);
  });

  it("ID externo repetido contra o banco recusa (duplicate_external_id) e não grava nenhum dos outros campos", async () => {
    const { db } = await setup();
    const idA = stopId("A");
    const idC = stopId("C");

    // Dá o ID "3479" para o ponto A
    const resA = await saveStopEdit(
      db,
      idA,
      { name: "Ponto A", aliases: [], externalId: "3479", note: null },
      NOW,
    );
    expect(resA.ok).toBe(true);

    const beforeC = (await db.select().from(stop).where(eq(stop.id, idC)))[0]!;

    // Tentar salvar o ponto C com o mesmo ID "3479" (mesmo com espaços e maiúsculas diferentes)
    const resC = await saveStopEdit(
      db,
      idC,
      { name: "Novo Nome C", aliases: ["Novo Apelido"], externalId: "  3479  ", note: "Nova nota" },
      NOW + 1000,
    );

    expect(resC).toEqual({ ok: false, reason: "duplicate_external_id" });

    // Nenhum campo do ponto C foi alterado
    const afterC = (await db.select().from(stop).where(eq(stop.id, idC)))[0]!;
    expect(afterC).toEqual(beforeC);
  });

  it("Desfazer vencido (outra gravação depois) devolve stale e não muda o banco", async () => {
    const { db } = await setup();
    const id = stopId("A");

    const first = await saveStopEdit(
      db,
      id,
      { name: "Primeira Edição", aliases: ["P1"], externalId: null, note: null },
      NOW,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Outra gravação acontece depois
    const second = await saveStopEdit(
      db,
      id,
      { name: "Segunda Edição", aliases: ["P2"], externalId: null, note: null },
      NOW + 1000,
    );
    expect(second.ok).toBe(true);

    // O primeiro Desfazer agora está vencido (stale)
    const undoRes = await first.undo(NOW + 2000);
    expect(undoRes).toEqual({ ok: false, reason: "stale" });

    // O banco continua com o estado da segunda edição
    const current = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(current.name).toBe("Segunda Edição");
    expect(current.aliases).toEqual(["P2"]);
  });

  it("localização continua intacta depois de gravar e depois de desfazer", async () => {
    const { db } = await setup();
    const id = stopId("E");

    // Grava uma localização no ponto
    await saveStopLocation(db, id, { lat: 39.7436, lon: -8.8071 }, "manual", NOW);
    const withLocation = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(withLocation.lat).toBeCloseTo(39.7436);
    expect(withLocation.lon).toBeCloseTo(-8.8071);
    expect(withLocation.locationSource).toBe("manual");

    // Edita nome e apelidos
    const res = await saveStopEdit(
      db,
      id,
      { name: "Ponto E com Coordenada", aliases: ["Coords"], externalId: "9000", note: "Nota" },
      NOW + 500,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const afterEdit = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(afterEdit.lat).toBe(withLocation.lat);
    expect(afterEdit.lon).toBe(withLocation.lon);
    expect(afterEdit.locationSource).toBe(withLocation.locationSource);

    // Desfaz
    const undoRes = await res.undo(NOW + 1000);
    expect(undoRes).toEqual({ ok: true });

    const afterUndo = (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(afterUndo.lat).toBe(withLocation.lat);
    expect(afterUndo.lon).toBe(withLocation.lon);
    expect(afterUndo.locationSource).toBe(withLocation.locationSource);
  });

  it("ponto não encontrado devolve not_found", async () => {
    const { db } = await setup();
    const res = await saveStopEdit(
      db,
      "inexistente",
      { name: "X", aliases: [], externalId: null, note: null },
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("T-82: ida e volta do backup: apelido num ponto oficial exporta e volta como official_edited", async () => {
    const src = await setup();
    const id = stopId("A");

    // Grava apelido "shopping" no ponto oficial
    const saveRes = await saveStopEdit(
      src.db,
      id,
      { name: "Arrabalde", aliases: ["shopping"], externalId: "3517", note: "Nota oficial editada" },
      NOW,
    );
    expect(saveRes.ok).toBe(true);

    const editedRow = (await src.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(editedRow.source).toBe("official_edited");
    expect(editedRow.aliases).toEqual(["shopping"]);

    // Exporta backup
    const exportText = await serializeBackup(
      await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }),
      sha256,
    );

    // Importa num banco limpo com a MOBILIS
    const dst = await setup();
    const beforeDst = (await dst.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(beforeDst.source).toBe("official");
    expect(beforeDst.aliases).toEqual([]);

    const preview = await prepareImport(dst.raw, exportText, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });

    const afterDst = (await dst.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(afterDst.source).toBe("official_edited");
    expect(afterDst.aliases).toEqual(["shopping"]);
    expect(afterDst.externalId).toBe("3517");
    expect(afterDst.note).toBe("Nota oficial editada");
  });
});

describe("stopEdit (bloco 4: lacunas da revisão do bloco 3)", () => {
  const empty = { aliases: [] as string[], externalId: null, note: null };
  const read = async (db: Awaited<ReturnType<typeof setup>>["db"], id: string) =>
    (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
  const insertUserStop = async (db: Awaited<ReturnType<typeof setup>>["db"], id: string, over: Partial<typeof stop.$inferInsert> = {}) =>
    db.insert(stop).values({
      id,
      createdAt: 100,
      updatedAt: 100,
      deletedAt: null,
      source: "user",
      officialKey: null,
      networkId: "net-1",
      name: `Nome ${id}`,
      aliases: [],
      externalId: null,
      note: null,
      ...over,
    });

  it("nome com 80 caracteres salva; com 81 devolve invalid", async () => {
    const { db } = await setup();
    const id = stopId("A");
    expect((await saveStopEdit(db, id, { ...empty, name: "n".repeat(80) }, NOW)).ok).toBe(true);
    expect((await read(db, id)).name).toBe("n".repeat(80));
    expect(await saveStopEdit(db, id, { ...empty, name: "n".repeat(81) }, NOW + 10)).toEqual({ ok: false, reason: "invalid" });
    expect((await read(db, id)).name).toBe("n".repeat(80));
  });

  it("nome só com espaços devolve invalid", async () => {
    const { db } = await setup();
    const id = stopId("A");
    const before = await read(db, id);
    expect(await saveStopEdit(db, id, { ...empty, name: "    " }, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(await read(db, id)).toEqual(before);
  });

  it("nota com 200 caracteres salva; com 201 devolve invalid", async () => {
    const { db } = await setup();
    const id = stopId("A");
    const name = (await read(db, id)).name;
    expect((await saveStopEdit(db, id, { ...empty, name, note: "x".repeat(200) }, NOW)).ok).toBe(true);
    expect((await read(db, id)).note).toBe("x".repeat(200));
    expect(await saveStopEdit(db, id, { ...empty, name, note: "x".repeat(201) }, NOW + 10)).toEqual({ ok: false, reason: "invalid" });
    expect((await read(db, id)).note).toBe("x".repeat(200));
  });

  it("ID externo de outro ponto com caixa diferente (ab-1 contra AB-1) devolve duplicate_external_id", async () => {
    const { db } = await setup();
    await insertUserStop(db, "u-1", { externalId: "AB-1" });
    await insertUserStop(db, "u-2");
    expect(await saveStopEdit(db, "u-2", { ...empty, name: "Nome u-2", externalId: "ab-1" }, NOW)).toEqual({
      ok: false,
      reason: "duplicate_external_id",
    });
  });

  it("a caixa conta nos dois sentidos: AB-1 digitado contra ab-1 de outro ponto também é duplicado", async () => {
    const { db } = await setup();
    await insertUserStop(db, "u-1", { externalId: "ab-1" });
    await insertUserStop(db, "u-2");
    expect(await saveStopEdit(db, "u-2", { ...empty, name: "Nome u-2", externalId: "AB-1" }, NOW)).toEqual({
      ok: false,
      reason: "duplicate_external_id",
    });
  });

  it("ID externo de outro ponto gravado com espaços nas pontas também é duplicado", async () => {
    const { db } = await setup();
    await insertUserStop(db, "u-1", { externalId: "  AB-1  " });
    await insertUserStop(db, "u-2");
    expect(await saveStopEdit(db, "u-2", { ...empty, name: "Nome u-2", externalId: "AB-1" }, NOW)).toEqual({
      ok: false,
      reason: "duplicate_external_id",
    });
  });

  it("salvar o próprio ponto mantendo o ID externo que ele já tem funciona (só mudei a nota)", async () => {
    const { db } = await setup();
    await insertUserStop(db, "u-1", { externalId: "AB-1", note: "antiga" });
    const res = await saveStopEdit(db, "u-1", { ...empty, name: "Nome u-1", externalId: "AB-1", note: "nova" }, NOW);
    expect(res.ok).toBe(true);
    const row = await read(db, "u-1");
    expect(row.externalId).toBe("AB-1");
    expect(row.note).toBe("nova");
  });

  it("nome e nota são gravados sem espaços nas pontas", async () => {
    const { db } = await setup();
    const id = stopId("A");
    const res = await saveStopEdit(db, id, { ...empty, name: "  Largo Novo  ", note: "  uma nota  " }, NOW);
    expect(res.ok).toBe(true);
    const row = await read(db, id);
    expect(row.name).toBe("Largo Novo");
    expect(row.note).toBe("uma nota");
  });

  it("Desfazer devolve note e externalId exatamente como estavam (valores não vazios)", async () => {
    const { db } = await setup();
    await insertUserStop(db, "u-1", { externalId: "ID-ANTIGO", note: "nota antiga" });
    const res = await saveStopEdit(
      db,
      "u-1",
      { name: "Nome novo", aliases: ["a"], externalId: "ID-NOVO", note: "nota nova" },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await res.undo(NOW + 1)).toEqual({ ok: true });
    const row = await read(db, "u-1");
    expect(row.externalId).toBe("ID-ANTIGO");
    expect(row.note).toBe("nota antiga");
    expect(row.name).toBe("Nome u-1");
    expect(row.aliases).toEqual([]);
  });
});

describe("stopEdit com localização (F3, D-190, E-08.5 bloco 8)", () => {
  const empty = { aliases: [] as string[], externalId: null, note: null };
  const read = async (db: Awaited<ReturnType<typeof setup>>["db"], id: string) =>
    (await db.select().from(stop).where(eq(stop.id, id)))[0]!;

  const insertUserStopWithLoc = async (
    db: Awaited<ReturnType<typeof setup>>["db"],
    id: string,
    over: Partial<typeof stop.$inferInsert> = {},
  ) =>
    db.insert(stop).values({
      id,
      createdAt: 100,
      updatedAt: 100,
      deletedAt: null,
      source: "user",
      officialKey: null,
      networkId: "net-1",
      name: `Nome ${id}`,
      aliases: [],
      externalId: null,
      note: null,
      ...over,
    });

  it("(a) location ausente não muda lat, lon nem locationSource de um ponto que já tem localização", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-loc-1", {
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res = await saveStopEdit(db, "u-loc-1", { ...empty, name: "Nome Atualizado" }, NOW);
    expect(res.ok).toBe(true);
    const row = await read(db, "u-loc-1");
    expect(row.name).toBe("Nome Atualizado");
    expect(row.lat).toBe(39.74);
    expect(row.lon).toBe(-8.8);
    expect(row.locationSource).toBe("manual");
  });

  it("(b) ponto novo na edição: grava e locationSource = 'manual'", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-loc-2", {
      lat: null,
      lon: null,
      locationSource: null,
    });
    const res = await saveStopEdit(
      db,
      "u-loc-2",
      { ...empty, name: "Nome u-loc-2", location: { lat: 39.7436, lon: -8.8071 } },
      NOW,
    );
    expect(res.ok).toBe(true);
    const row = await read(db, "u-loc-2");
    expect(row.lat).toBe(39.7436);
    expect(row.lon).toBe(-8.8071);
    expect(row.locationSource).toBe("manual");
  });

  it("(c) mover: grava o novo", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-loc-3", {
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res = await saveStopEdit(
      db,
      "u-loc-3",
      { ...empty, name: "Nome u-loc-3", location: { lat: 39.75, lon: -8.81 } },
      NOW,
    );
    expect(res.ok).toBe(true);
    const row = await read(db, "u-loc-3");
    expect(row.lat).toBe(39.75);
    expect(row.lon).toBe(-8.81);
    expect(row.locationSource).toBe("manual");
  });

  it("(d) null apaga os três", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-loc-4", {
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res = await saveStopEdit(
      db,
      "u-loc-4",
      { ...empty, name: "Nome u-loc-4", location: null },
      NOW,
    );
    expect(res.ok).toBe(true);
    const row = await read(db, "u-loc-4");
    expect(row.lat).toBeNull();
    expect(row.lon).toBeNull();
    expect(row.locationSource).toBeNull();
  });

  it("(e) ponto official que ganha localização vira official_edited", async () => {
    const { db } = await setup();
    const id = stopId("A");
    const original = await read(db, id);
    expect(original.source).toBe("official");
    expect(original.lat).toBeNull();

    const res = await saveStopEdit(
      db,
      id,
      { ...empty, name: original.name, location: { lat: 39.7436, lon: -8.8071 } },
      NOW,
    );
    expect(res.ok).toBe(true);
    const row = await read(db, id);
    expect(row.source).toBe("official_edited");
    expect(row.lat).toBe(39.7436);
    expect(row.lon).toBe(-8.8071);
    expect(row.locationSource).toBe("manual");
  });

  it("(f) ponto official que só tem a localização apagada também vira official_edited", async () => {
    const { db } = await setup();
    const id = "off-loc-1";
    await db.insert(stop).values({
      id,
      createdAt: 100,
      updatedAt: 100,
      deletedAt: null,
      source: "official",
      officialKey: "k1",
      networkId: "net-1",
      name: "Oficial Com Coordenada",
      aliases: [],
      externalId: null,
      note: null,
      lat: 39.74,
      lon: -8.8,
      locationSource: "suggested",
    });

    const res = await saveStopEdit(
      db,
      id,
      { ...empty, name: "Oficial Com Coordenada", location: null },
      NOW,
    );
    expect(res.ok).toBe(true);
    const row = await read(db, id);
    expect(row.source).toBe("official_edited");
    expect(row.lat).toBeNull();
    expect(row.lon).toBeNull();
    expect(row.locationSource).toBeNull();
  });

  it("(g) Desfazer restaura nome, apelidos, ID externo, nota e a localização anterior", async () => {
    const { db } = await setup();

    // Caso 1: com localização antes
    await insertUserStopWithLoc(db, "u-undo-1", {
      name: "Nome Antigo",
      aliases: ["alias1"],
      externalId: "EXT-1",
      note: "nota antiga",
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res1 = await saveStopEdit(
      db,
      "u-undo-1",
      {
        name: "Nome Novo",
        aliases: ["alias2"],
        externalId: "EXT-2",
        note: "nota nova",
        location: { lat: 39.75, lon: -8.81 },
      },
      NOW,
    );
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    const undoRes1 = await res1.undo(NOW + 5000);
    expect(undoRes1).toEqual({ ok: true });
    const row1 = await read(db, "u-undo-1");
    expect(row1.name).toBe("Nome Antigo");
    expect(row1.aliases).toEqual(["alias1"]);
    expect(row1.externalId).toBe("EXT-1");
    expect(row1.note).toBe("nota antiga");
    expect(row1.lat).toBe(39.74);
    expect(row1.lon).toBe(-8.8);
    expect(row1.locationSource).toBe("manual");

    // Caso 2: sem localização antes
    await insertUserStopWithLoc(db, "u-undo-2", {
      name: "Sem Loc",
      lat: null,
      lon: null,
      locationSource: null,
    });
    const res2 = await saveStopEdit(
      db,
      "u-undo-2",
      { ...empty, name: "Com Loc", location: { lat: 39.7436, lon: -8.8071 } },
      NOW + 10,
    );
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    const undoRes2 = await res2.undo(NOW + 5000);
    expect(undoRes2).toEqual({ ok: true });
    const row2 = await read(db, "u-undo-2");
    expect(row2.name).toBe("Sem Loc");
    expect(row2.lat).toBeNull();
    expect(row2.lon).toBeNull();
    expect(row2.locationSource).toBeNull();

    // Caso 3: com location ausente (undefined)
    await insertUserStopWithLoc(db, "u-undo-3", {
      name: "Nome 3",
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res3 = await saveStopEdit(
      db,
      "u-undo-3",
      { ...empty, name: "Nome 3 Editado" },
      NOW + 20,
    );
    expect(res3.ok).toBe(true);
    if (!res3.ok) return;
    const undoRes3 = await res3.undo(NOW + 5000);
    expect(undoRes3).toEqual({ ok: true });
    const row3 = await read(db, "u-undo-3");
    expect(row3.name).toBe("Nome 3");
    expect(row3.lat).toBe(39.74);
    expect(row3.lon).toBe(-8.8);
    expect(row3.locationSource).toBe("manual");
  });

  it("(h) Desfazer com updatedAt mudado por outro lado devolve stale e não restaura a localização", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-stale", {
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res = await saveStopEdit(
      db,
      "u-stale",
      { ...empty, name: "Nome Modificado", location: { lat: 39.75, lon: -8.81 } },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Outro lado atualiza o ponto
    await db.update(stop).set({ updatedAt: NOW + 1000 }).where(eq(stop.id, "u-stale"));

    const undoRes = await res.undo(NOW + 5000);
    expect(undoRes).toEqual({ ok: false, reason: "stale" });

    const row = await read(db, "u-stale");
    expect(row.lat).toBe(39.75);
    expect(row.lon).toBe(-8.81);
    expect(row.locationSource).toBe("manual");
  });

  it("(i) location fora da faixa (lat: 91) devolve invalid e nada foi gravado (nome nem localização)", async () => {
    const { db } = await setup();
    await insertUserStopWithLoc(db, "u-inv", {
      name: "Original",
      lat: 39.74,
      lon: -8.8,
      locationSource: "manual",
    });
    const res = await saveStopEdit(
      db,
      "u-inv",
      { ...empty, name: "Novo Nome", location: { lat: 91, lon: 0 } },
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "invalid" });

    const row = await read(db, "u-inv");
    expect(row.name).toBe("Original");
    expect(row.lat).toBe(39.74);
    expect(row.lon).toBe(-8.8);
  });

  it("(j) o backup de ida e volta de um ponto oficial com localização editada leva a coordenada", async () => {
    const src = await setup();
    const id = stopId("A");

    const saveRes = await saveStopEdit(
      src.db,
      id,
      {
        name: "Arrabalde",
        aliases: ["shopping"],
        externalId: "3517",
        note: "Nota com coordenada",
        location: { lat: 39.7436, lon: -8.8071 },
      },
      NOW,
    );
    expect(saveRes.ok).toBe(true);

    const editedRow = (await src.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(editedRow.source).toBe("official_edited");
    expect(editedRow.lat).toBe(39.7436);
    expect(editedRow.lon).toBe(-8.8071);
    expect(editedRow.locationSource).toBe("manual");

    // Exporta backup
    const exportText = await serializeBackup(
      await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }),
      sha256,
    );

    // Importa num banco limpo com a MOBILIS
    const dst = await setup();
    const beforeDst = (await dst.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(beforeDst.source).toBe("official");
    expect(beforeDst.lat).toBeNull();

    const preview = await prepareImport(dst.raw, exportText, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });

    const afterDst = (await dst.db.select().from(stop).where(eq(stop.id, id)))[0]!;
    expect(afterDst.source).toBe("official_edited");
    expect(afterDst.aliases).toEqual(["shopping"]);
    expect(afterDst.lat).toBe(39.7436);
    expect(afterDst.lon).toBe(-8.8071);
    expect(afterDst.locationSource).toBe("manual");
  });
});

