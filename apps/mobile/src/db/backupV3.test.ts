/// <reference types="node" />
// Backup formatVersion 3 no banco (E-07, T-72, D-090): a localização do ponto, do lugar e do registro faz a ida e volta. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_FORMAT_VERSION, type BackupFile, serializeBackup } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { fixture, type Fixture } from "../data/registroFixture";
import { importBackup, readBackupInput } from "./backup";
import type { BackupStore } from "./migrate";
import { SCENARIO_NOW, backupScenario } from "./testing/backupScenario";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FIXTURES = join(__dirname, "../../../../packages/domain/fixtures/backup");
const all = (f: Fixture, sql: string) => f.raw.all(sql, []) as Record<string, unknown>[];

const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };
const exportText = async (f: Fixture) => serializeBackup(await readBackupInput(f.raw, { now: SCENARIO_NOW, appVersion: "1.0.0" }), sha256);
const scenarioV3 = () => backupScenario({ withAlarm: true, withLocation: true });

async function importText(f: Fixture, text: string) {
  const preview = await prepareImport(f.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  return f.registro.exclusive(() => importBackup(f.raw, preview.file, { backups: noCopies, now: SCENARIO_NOW + 60_000 }));
}

/** O que a E-07 grava de localização, de tudo que o backup cobre. */
const locationRows = (f: Fixture) => ({
  stop: all(f, "SELECT id, source, lat, lon, location_source FROM stop WHERE lat IS NOT NULL OR location_source IS NOT NULL ORDER BY id"),
  place: all(f, "SELECT id, lat, lon FROM place ORDER BY id"),
  observation: all(f, "SELECT id, gps_lat, gps_lon, gps_accuracy_m FROM observation WHERE gps_lat IS NOT NULL ORDER BY id"),
});

describe("T-72: ida e volta do backup com localização", () => {
  it("o cenário tem os quatro casos de localização", async () => {
    const rows = locationRows(await scenarioV3());
    expect(rows.stop).toEqual([
      expect.objectContaining({ source: "official_edited", location_source: "suggested", lat: 39.7441 }),
      { id: "stop-do-rick", source: "user", lat: 39.7455, lon: -8.804, location_source: "manual" },
    ]);
    expect(rows.place).toEqual([{ id: "place-casa", lat: 39.743, lon: -8.81 }]);
    expect(rows.observation).toHaveLength(1);
  });

  it("exportar, apagar (banco novo), importar: mesmas coordenadas e mesmo location_source; o arquivo sai com formatVersion 3", async () => {
    const src = await scenarioV3();
    const before = locationRows(src);
    const text = await exportText(src);
    expect((JSON.parse(text) as BackupFile).formatVersion).toBe(3);
    expect(BACKUP_FORMAT_VERSION).toBe(3);

    const dst = await fixture();
    await importText(dst, text);
    expect(locationRows(dst)).toEqual(before);
    // O ponto oficial editado vai em official_edits.stop com a coluna nova.
    const file = JSON.parse(text) as BackupFile;
    expect(file.tables.official_edits.stop).toHaveLength(1);
    expect(file.tables.official_edits.stop![0]).toMatchObject({ lat: 39.7441, lon: -8.8072, location_source: "suggested" });
    expect(Object.keys(file.tables.stop[0]!)).toEqual(["id", "created_at", "updated_at", "deleted_at", "source", "official_key", "network_id", "name", "aliases", "external_id", "lat", "lon", "location_source", "note"]);
  });

  it("um arquivo com formatVersion 4 é recusado com format_newer", async () => {
    const text = await exportText(await scenarioV3());
    // Reassina o checksum (senão a recusa seria por checksum_mismatch, não pela versão).
    const zero = `sha256:${"0".repeat(64)}`;
    const unsigned = `${JSON.stringify({ ...(JSON.parse(text) as object), formatVersion: 4, checksum: zero }, null, 2)}\n`;
    const four = unsigned.replace(zero, `sha256:${sha256(unsigned)}`);
    expect(await prepareImport((await fixture()).raw, four, sha256)).toMatchObject({ ok: false, problem: "format_newer" });
  });
});

describe("D-090: arquivos de exemplo", () => {
  it("o format-v3.json é exatamente o que o exportador de hoje gera do cenário (formato mudou sem subir a versão → quebra)", async () => {
    const text = await exportText(await scenarioV3());
    // Gerar de novo (só ao criar uma formatVersion nova): NOTEBUS_WRITE_BACKUP_FIXTURE=1 npx vitest run src/db/backupV3.test.ts
    if (process.env.NOTEBUS_WRITE_BACKUP_FIXTURE === "1") writeFileSync(join(FIXTURES, "format-v3.json"), text);
    expect(text).toBe(readFileSync(join(FIXTURES, "format-v3.json"), "utf8"));
  });

  it("os exemplos 1, 2 e 3 importam num banco novo, e os antigos voltam com location_source vazio", async () => {
    expect(readdirSync(FIXTURES).sort()).toEqual(["format-v1.json", "format-v2.json", "format-v3.json"]);
    for (const name of readdirSync(FIXTURES)) {
      const dst = await fixture();
      await importText(dst, readFileSync(join(FIXTURES, name), "utf8"));
      const withSource = all(dst, "SELECT id FROM stop WHERE location_source IS NOT NULL");
      expect([name, withSource.length]).toEqual([name, name === "format-v3.json" ? 2 : 0]);
    }
  });
});
