/// <reference types="node" />
// Backup formatVersion 3 (E-07, T-72, D-090): `stop.location_source` entra e os formatos 1 e 2 continuam lendo.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT_VERSION, BACKUP_TABLES, BACKUP_V1_COLUMNS, BACKUP_V2_COLUMNS, BACKUP_V3_COLUMNS, migrateBackup, parseBackup, type BackupFile } from "./backup.ts";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const readFixture = (name: string) => readFileSync(join(__dirname, "../fixtures/backup", name), "utf8");
const deps = { sha256, installedDatasets: [{ name: "exemplo", version: "2026-01-01" }] };
const STOP_V3 = ["id", "created_at", "updated_at", "deleted_at", "source", "official_key", "network_id", "name", "aliases", "external_id", "lat", "lon", "location_source", "note"];

describe("T-72: contrato da formatVersion 3", () => {
  it("os contratos da 1 e da 2 estão intactos e a 3 só acrescenta stop.location_source, depois de lon", () => {
    expect(BACKUP_FORMAT_VERSION).toBe(3);
    expect(BACKUP_V1_COLUMNS.stop).toEqual(STOP_V3.filter((c) => c !== "location_source"));
    expect(BACKUP_V2_COLUMNS.stop).toEqual(BACKUP_V1_COLUMNS.stop);
    expect(BACKUP_V3_COLUMNS.stop).toEqual(STOP_V3);
    expect(Object.keys(BACKUP_V3_COLUMNS)).toEqual(Object.keys(BACKUP_V2_COLUMNS));
    for (const t of BACKUP_TABLES) if (t !== "stop") expect(BACKUP_V3_COLUMNS[t]).toEqual(BACKUP_V2_COLUMNS[t]);
  });

  it("o format-v3.json publicado passa por todas as verificações, com a localização e o location_source dos dois pontos", async () => {
    const text = readFixture("format-v3.json");
    const parsed = await parseBackup(text, deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    expect(parsed.backup.formatVersion).toBe(3);
    expect(parsed.backup.tables.stop.map((r) => [r.id, r.lat, r.lon, r.location_source])).toEqual([["stop-do-rick", 39.7455, -8.804, "manual"]]);
    expect(parsed.backup.tables.official_edits.stop!.map((r) => [r.lat, r.lon, r.location_source])).toEqual([[39.7441, -8.8072, "suggested"]]);
    expect(parsed.backup.tables.place[0]).toMatchObject({ lat: 39.743, lon: -8.81 });
    expect(parsed.backup.tables.observation.filter((o) => o.gps_lat !== null)).toEqual([expect.objectContaining({ gps_lat: 39.7441, gps_lon: -8.8072, gps_accuracy_m: 12.5 })]);
  });

  it("formatVersion 4 (mais nova que o app) → format_newer", () => {
    expect(migrateBackup({ formatVersion: 4 })).toMatchObject({ ok: false, problem: "format_newer" });
  });
});

describe("D-090: os formatos 1 e 2 sobem até a 3", () => {
  it("o format-v2.json (sem edição oficial de ponto na lista) vira v3 com location_source nulo, na ordem do contrato", async () => {
    const original = JSON.parse(readFixture("format-v2.json")) as BackupFile;
    expect(original.formatVersion).toBe(2);
    const parsed = await parseBackup(readFixture("format-v2.json"), deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    expect(parsed.backup.formatVersion).toBe(3);
    const stops = [...parsed.backup.tables.stop, ...(parsed.backup.tables.official_edits.stop ?? [])];
    expect(stops.length).toBeGreaterThan(0);
    for (const row of stops) {
      expect(Object.keys(row)).toEqual(STOP_V3);
      expect(row.location_source).toBeNull();
    }
    // O resto do arquivo fica como estava.
    expect(parsed.backup.tables.observation).toEqual(original.tables.observation);
    expect(parsed.backup.tables.departure_alarm).toEqual(original.tables.departure_alarm);
  });

  it("o format-v1.json também chega à 3 (1 → 2 → 3): departure_alarm vazio e location_source nulo", async () => {
    const parsed = await parseBackup(readFixture("format-v1.json"), deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    expect(parsed.backup.formatVersion).toBe(3);
    expect(parsed.backup.tables.departure_alarm).toEqual([]);
    for (const row of [...parsed.backup.tables.stop, ...(parsed.backup.tables.official_edits.stop ?? [])]) expect(row.location_source).toBeNull();
  });

  it("a conversão 2 → 3 não mexe no objeto lido", () => {
    const raw = JSON.parse(readFixture("format-v2.json")) as Record<string, unknown>;
    const before = JSON.stringify(raw);
    expect(migrateBackup(raw).ok).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("v3 adulterado (uma coordenada) é recusado pelo checksum", async () => {
    const text = readFixture("format-v3.json").replace('"lat": 39.7455', '"lat": 39.7456');
    expect(text).not.toBe(readFixture("format-v3.json"));
    expect(await parseBackup(text, deps)).toMatchObject({ ok: false, problem: "checksum_mismatch" });
  });
});
