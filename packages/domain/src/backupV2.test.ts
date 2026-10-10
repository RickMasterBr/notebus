/// <reference types="node" />
// Backup formatVersion 2 (E-06, D-104, T-59): o aviso de saída entra, o histórico não, e o formato 1 continua lendo (D-090).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT_VERSION, BACKUP_TABLES, BACKUP_V1_COLUMNS, BACKUP_V2_COLUMNS, migrateBackup, parseBackup, serializeBackup, type BackupFile, type BackupInput } from "./backup.ts";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FIXTURES = join(__dirname, "../fixtures/backup");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const MOBILIS = { name: "exemplo", version: "2026-01-01" };
const deps = { sha256, installedDatasets: [MOBILIS] };

const alarmRow = (id: string) =>
  Object.fromEntries(BACKUP_V2_COLUMNS.departure_alarm.map((c) => [c, null])) as Record<string, string | number | null> & { id: string };

function input(): BackupInput {
  const alarm = { ...alarmRow("a1"), id: "a1", created_at: 1, updated_at: 1, source: "user", option_id: "opt", anchor_trip_id: "trip", anchor_base_minute: 492, weekdays: "[1,3,5]", valid_from: "2026-10-01", enabled: 1 };
  return { schemaVersion: 2, appVersion: "1.0.0", exportedAt: Date.UTC(2026, 9, 25, 7, 0, 0), network: null, datasets: [MOBILIS], tables: { departure_alarm: [alarm] }, officialEdits: {} };
}

describe("T-59: contrato da formatVersion 2", () => {
  it("o contrato da 1 está intacto (22 tabelas, sem aviso) e a 2 acrescenta só departure_alarm, depois das da 1", () => {
    expect(BACKUP_FORMAT_VERSION).toBe(4);
    expect(Object.keys(BACKUP_V1_COLUMNS)).toHaveLength(22);
    expect("departure_alarm" in BACKUP_V1_COLUMNS).toBe(false);
    expect(Object.keys(BACKUP_V2_COLUMNS)).toEqual([...Object.keys(BACKUP_V1_COLUMNS), "departure_alarm"]);
    expect(BACKUP_V2_COLUMNS.departure_alarm).toEqual([
      "id", "created_at", "updated_at", "deleted_at", "source",
      "option_id", "anchor_trip_id", "anchor_base_minute", "weekdays", "once_date", "valid_from", "valid_to", "enabled",
    ]);
    expect(BACKUP_TABLES).toContain("departure_alarm");
    expect(BACKUP_TABLES as string[]).not.toContain("alarm_event");
  });

  it("(a, c) exportar com aviso: o arquivo traz departure_alarm e a contagem; alarm_event não aparece em lugar nenhum", async () => {
    const text = await serializeBackup(input(), sha256);
    const file = JSON.parse(text) as BackupFile;
    expect(file.formatVersion).toBe(4);
    expect(file.counts.departure_alarm).toBe(1);
    expect(file.tables.departure_alarm.map((r) => r.id)).toEqual(["a1"]);
    expect(text).not.toContain("alarm_event");
    const parsed = await parseBackup(text, deps);
    expect(parsed.ok && parsed.backup.tables.departure_alarm).toHaveLength(1);
  });

  it("(d) arquivo v2 adulterado (um dígito do aviso) é recusado pelo checksum", async () => {
    const text = await serializeBackup(input(), sha256);
    expect(await parseBackup(text.replace('"anchor_base_minute": 492', '"anchor_base_minute": 493'), deps)).toMatchObject({ ok: false, problem: "checksum_mismatch" });
  });
});

describe("T-59, D-090: o formato 1 continua lendo", () => {
  it("(b) o format-v1.json publicado passa por todas as verificações e vira v2 com departure_alarm vazio", async () => {
    const text = readFixture("format-v1.json");
    const original = JSON.parse(text) as BackupFile;
    expect(original.formatVersion).toBe(1);
    expect("departure_alarm" in original.tables).toBe(false);

    const parsed = await parseBackup(text, deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    expect(parsed.backup.formatVersion).toBe(4);
    expect(parsed.backup.tables.departure_alarm).toEqual([]);
    expect(parsed.backup.counts.departure_alarm).toBe(0);
    // O resto do arquivo fica como estava.
    expect(parsed.backup.tables.observation).toEqual(original.tables.observation);
  });

  it("a conversão não mexe no objeto lido e o checksum é conferido no texto original (antes de converter)", async () => {
    const raw = JSON.parse(readFixture("format-v1.json")) as Record<string, unknown>;
    const before = JSON.stringify(raw);
    const up = migrateBackup(raw);
    expect(up.ok).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("v1 adulterado continua recusado pelo checksum, como antes", async () => {
    const text = readFixture("format-v1.json").replace('"kind": "boarded"', '"kind": "passed"');
    expect(await parseBackup(text, deps)).toMatchObject({ ok: false, problem: "checksum_mismatch" });
  });

  it("formatVersion 5 (mais nova que o app) → format_newer", () => {
    expect(migrateBackup({ formatVersion: 5 })).toMatchObject({ ok: false, problem: "format_newer" });
  });
});
