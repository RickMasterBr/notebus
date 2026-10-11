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
