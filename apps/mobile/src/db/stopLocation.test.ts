/// <reference types="node" />
// Escrita da localização do ponto (E-07 §3.1, §3.2): official → official_edited, user fica user, apagar não rebaixa. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { importBackup, readBackupInput } from "./backup";
import { importMobilis } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { stop } from "./schema";
import { clearStopLocation, saveStopLocation } from "./stopLocation";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { exampleSeed } from "./testing/exampleSeed";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const T0 = 1_790_000_000_000;
const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw = {
    exec: async (s: string) => { sqlite.exec(s); },
    run: async (s: string, p: (string | number | null)[] = []) => ({ changes: Number(sqlite.prepare(s).run(...(p as never[])).changes) }),
    all: async (s: string, p: (string | number | null)[] = []) => sqlite.prepare(s).all(...(p as never[])) as Record<string, unknown>[],
    userVersion: async () => 1,
  };
  await importMobilis(raw, exampleSeed("2026-09-01"), { now: () => T0 });
  const official = (await db.select().from(stop).where(eq(stop.source, "official")))[0]!;
  // Ponto criado pelo usuário (inventado), na mesma rede.
  await raw.run(
    "INSERT INTO stop (id, created_at, updated_at, source, network_id, name, aliases) VALUES ('stop-do-rick', ?, ?, 'user', ?, 'Ponto do Rick', '[]')",
    [T0, T0, official.networkId],
  );
  const row = async (id: string) => (await db.select().from(stop).where(eq(stop.id, id)))[0]!;
  return { db, raw, official, row };
}

describe("saveStopLocation / clearStopLocation (E-07 §3.1)", () => {
  it("ponto oficial que ganha localização vira official_edited, com origem, coordenada e updated_at", async () => {
    const { db, official, row } = await setup();
    expect(official.lat).toBeNull();
    await saveStopLocation(db, official.id, { lat: 39.7441, lon: -8.8072 }, "suggested", T0 + 1000);
    expect(await row(official.id)).toMatchObject({ source: "official_edited", lat: 39.7441, lon: -8.8072, locationSource: "suggested", updatedAt: T0 + 1000 });
  });

  it("ponto do usuário continua user; manual e suggested ficam como chegaram", async () => {
    const { db, official, row } = await setup();
    await saveStopLocation(db, "stop-do-rick", { lat: 39.7455, lon: -8.804 }, "manual", T0 + 1000);
    expect(await row("stop-do-rick")).toMatchObject({ source: "user", locationSource: "manual", lat: 39.7455, lon: -8.804 });
    await saveStopLocation(db, "stop-do-rick", { lat: 39.746, lon: -8.805 }, "suggested", T0 + 2000);
    expect(await row("stop-do-rick")).toMatchObject({ source: "user", locationSource: "suggested", lat: 39.746, lon: -8.805, updatedAt: T0 + 2000 });
    await saveStopLocation(db, official.id, { lat: 39.74, lon: -8.8 }, "manual", T0 + 3000);
    expect(await row(official.id)).toMatchObject({ locationSource: "manual" });
  });

  it("ponto já official_edited continua official_edited ao salvar de novo", async () => {
    const { db, official, row } = await setup();
    await saveStopLocation(db, official.id, { lat: 39.74, lon: -8.8 }, "suggested", T0 + 1000);
    await saveStopLocation(db, official.id, { lat: 39.75, lon: -8.81 }, "manual", T0 + 2000);
    expect(await row(official.id)).toMatchObject({ source: "official_edited", lat: 39.75, lon: -8.81, locationSource: "manual" });
  });

  it("clearStopLocation zera os três campos, sobe updated_at e mantém official_edited", async () => {
    const { db, official, row } = await setup();
    await saveStopLocation(db, official.id, { lat: 39.74, lon: -8.8 }, "manual", T0 + 1000);
    await clearStopLocation(db, official.id, T0 + 2000);
    expect(await row(official.id)).toMatchObject({ source: "official_edited", lat: null, lon: null, locationSource: null, updatedAt: T0 + 2000 });
    await saveStopLocation(db, "stop-do-rick", { lat: 39.7, lon: -8.8 }, "manual", T0 + 3000);
    await clearStopLocation(db, "stop-do-rick", T0 + 4000);
    expect(await row("stop-do-rick")).toMatchObject({ source: "user", lat: null, lon: null, locationSource: null, updatedAt: T0 + 4000 });
  });

  it("ponto inexistente ou apagado dá erro claro e não grava", async () => {
    const { db, raw, official, row } = await setup();
    await expect(saveStopLocation(db, "nao-existe", { lat: 39.7, lon: -8.8 }, "manual", T0 + 1000)).rejects.toThrow("ponto não encontrado");
    await expect(clearStopLocation(db, "nao-existe", T0 + 1000)).rejects.toThrow("ponto não encontrado");
    await raw.run("UPDATE stop SET deleted_at = ? WHERE id = 'stop-do-rick'", [T0 + 500]);
    await expect(saveStopLocation(db, "stop-do-rick", { lat: 39.7, lon: -8.8 }, "manual", T0 + 1000)).rejects.toThrow("ponto não encontrado");
    expect(await row("stop-do-rick")).toMatchObject({ lat: null, locationSource: null, updatedAt: T0 });
    // Nada mudou no ponto oficial só por causa das tentativas.
    expect(await row(official.id)).toMatchObject({ source: "official", lat: null });
  });

  it("ida e volta no backup: localização de ponto oficial exportada e importada num banco novo volta igual", async () => {
    const src = await setup();
    await saveStopLocation(src.db, src.official.id, { lat: 39.7441, lon: -8.8072 }, "suggested", T0 + 1000);
    const text = await serializeBackup(await readBackupInput(src.raw, { now: T0 + 2000, appVersion: "1.0.0" }), sha256);

    const dst = await setup();
    const preview = await prepareImport(dst.raw, text, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await importBackup(dst.raw, preview.file, { backups: noCopies, now: T0 + 3000 });

    expect(await dst.row(src.official.id)).toMatchObject({ source: "official_edited", lat: 39.7441, lon: -8.8072, locationSource: "suggested" });
  });
});
