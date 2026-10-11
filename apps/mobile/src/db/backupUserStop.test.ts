/// <reference types="node" />
/**
 * Backup do ponto criado por você (E-08 §5.4, bloco 7, Item 4): ida e volta com banco vazio + MOBILIS.
 * O ponto volta com nome, apelidos, ID externo e nota; o ponto apagado não volta para a lista.
 */
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { exampleNetworkSeed } from "../data/registroFixture";
import { importBackup, readBackupInput } from "./backup";
import { type ImportDb, importMobilis } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { listStops } from "./networkList";
import { stop } from "./schema";
import { createStop } from "./stopCreate";
import { deleteStop } from "./stopDelete";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
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
  return { db, raw };
}

async function roundTrip(src: Awaited<ReturnType<typeof setup>>) {
  const exportText = await serializeBackup(await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }), sha256);
  const dst = await setup();
  const preview = await prepareImport(dst.raw, exportText, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });
  return dst;
}

describe("backup do ponto criado (bloco 7, item 4)", () => {
  it("o ponto criado exporta e volta num banco novo com nome, apelidos, ID externo e nota", async () => {
    const src = await setup();
    const created = await createStop(
      src.db,
      { name: "Ponto do Rick", aliases: ["Casa", "Portão"], externalId: "R-1", note: "Perto da padaria" },
      NOW,
    );
    if (!created.ok) throw new Error("criação falhou");

    const dst = await roundTrip(src);

    const back = (await dst.db.select().from(stop).where(eq(stop.id, created.id)))[0]!;
    expect(back).toMatchObject({
      name: "Ponto do Rick",
      aliases: ["Casa", "Portão"],
      externalId: "R-1",
      note: "Perto da padaria",
      source: "user",
      officialKey: null,
      deletedAt: null,
    });
    expect((await listStops(dst.db)).find((s) => s.id === created.id)?.name).toBe("Ponto do Rick");
  });

  it("o ponto apagado não volta para a lista", async () => {
    const src = await setup();
    const kept = await createStop(src.db, { name: "Fica", aliases: [], externalId: null, note: null }, NOW);
    const gone = await createStop(src.db, { name: "Some", aliases: [], externalId: null, note: null }, NOW + 1);
    if (!kept.ok || !gone.ok) throw new Error("criação falhou");
    expect((await deleteStop(src.db, gone.id, NOW + 10)).ok).toBe(true);

    const dst = await roundTrip(src);

    const names = (await listStops(dst.db)).map((s) => s.name);
    expect(names).toContain("Fica");
    expect(names).not.toContain("Some");
  });
});
