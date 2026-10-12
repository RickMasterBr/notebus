/// <reference types="node" />
/**
 * Backup do ponto criado com localização (E-08 bloco 10, item 1): lat, lon e locationSource sobrevivem a exportar e importar.
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
import { stop } from "./schema";
import { createStop } from "./stopCreate";
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

describe("backup do ponto de usuário com localização (bloco 10, item 1)", () => {
  it("lat, lon e locationSource voltam iguais num banco novo", async () => {
    const src = await setup();
    const created = await createStop(
      src.db,
      { name: "Ponto do Mapa", aliases: [], externalId: null, note: null, location: { lat: 39.7437, lon: -8.8071 } },
      NOW,
    );
    if (!created.ok) throw new Error("criação falhou");

    const exportText = await serializeBackup(await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }), sha256);
    const dst = await setup();
    const preview = await prepareImport(dst.raw, exportText, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });

    const back = (await dst.db.select().from(stop).where(eq(stop.id, created.id)))[0]!;
    expect(back).toMatchObject({ lat: 39.7437, lon: -8.8071, locationSource: "manual", source: "user", deletedAt: null });
  });
});
