/// <reference types="node" />
// Backup formatVersion 4 (E-08, D-090, D-114, T-79, T-86): o feriado ganha `recurring`, o v3 sobe, a margem de fora é limitada.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_SETTING_KEYS,
  BACKUP_TABLES,
  BACKUP_V3_COLUMNS,
  BACKUP_V4_COLUMNS,
  OFFICIAL_EDIT_TABLES,
  type BackupFile,
  type BackupInput,
  migrateBackup,
  parseBackup,
  serializeBackup,
} from "./backup.ts";
import { clampMargin } from "./margin.ts";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const readFixture = (name: string) => readFileSync(join(__dirname, "../fixtures/backup", name), "utf8");
const MOBILIS = { name: "exemplo", version: "2026-01-01" };
const deps = { sha256, installedDatasets: [MOBILIS] };

const HOLIDAY_V4 = ["id", "created_at", "updated_at", "deleted_at", "source", "official_key", "network_id", "date", "name", "scope", "recurring"];

describe("E-08: contrato da formatVersion 4", () => {
  it("a 4 acrescenta só holiday.recurring, depois de scope; o contrato da 3 está intacto", () => {
    expect(BACKUP_FORMAT_VERSION).toBe(4);
    expect(BACKUP_V3_COLUMNS.holiday).toEqual(HOLIDAY_V4.filter((c) => c !== "recurring"));
    expect(BACKUP_V4_COLUMNS.holiday).toEqual(HOLIDAY_V4);
    expect(Object.keys(BACKUP_V4_COLUMNS)).toEqual(Object.keys(BACKUP_V3_COLUMNS));
    for (const t of BACKUP_TABLES) if (t !== "holiday") expect(BACKUP_V4_COLUMNS[t]).toEqual(BACKUP_V3_COLUMNS[t]);
    expect(OFFICIAL_EDIT_TABLES).toContain("holiday");
  });

  it("as preferências do calendário e dos avisos vão no backup", () => {
    expect(BACKUP_SETTING_KEYS).toEqual(expect.arrayContaining(["margin_minutes", "include_municipal_holidays", "alarms_allowed"]));
  });
});

describe("E-08 (a): 3 → 4 põe recurring = 0 depois de scope, nas duas tabelas", () => {
  const holiday = (id: string) => ({
    id, created_at: 1, updated_at: 1, deleted_at: null, source: "user", official_key: null, network_id: "net", date: "2026-05-22", name: "x", scope: "municipal",
  });

  it("holiday e official_edits.holiday ganham recurring: 0, na ordem do contrato; o objeto lido não muda", () => {
    const raw = { formatVersion: 3, tables: { holiday: [holiday("h1")], official_edits: { holiday: [{ ...holiday("h2"), source: "official_edited", official_key: "k" }], stop: [] } } };
    const before = JSON.stringify(raw);
    const up = migrateBackup(raw);
    expect(JSON.stringify(raw)).toBe(before);
    if (!up.ok) throw new Error(up.detail);
    const tables = up.backup.tables;
    expect(up.backup.formatVersion).toBe(4);
    expect(Object.keys(tables.holiday[0]!)).toEqual(HOLIDAY_V4);
    expect(tables.holiday[0]!.recurring).toBe(0);
    expect(Object.keys(tables.official_edits.holiday![0]!)).toEqual(HOLIDAY_V4);
    expect(tables.official_edits.holiday![0]!.recurring).toBe(0);
    expect(tables.official_edits.stop).toEqual([]);
  });

  it("arquivo v3 sem feriado nenhum também sobe (listas vazias)", () => {
    const up = migrateBackup({ formatVersion: 3, tables: { holiday: [], official_edits: {} } });
    expect(up).toMatchObject({ ok: true, backup: { formatVersion: 4, tables: { holiday: [] } } });
  });
});

describe("E-08 (c, d): arquivos antigos e mais novos", () => {
  it("os exemplos 1, 2 e 3 continuam passando por todas as verificações e chegam à 4", async () => {
    for (const name of ["format-v1.json", "format-v2.json", "format-v3.json"]) {
      const parsed = await parseBackup(readFixture(name), deps);
      if (!parsed.ok) throw new Error(`${name}: ${parsed.problem}: ${parsed.detail}`);
      expect(parsed.backup.formatVersion).toBe(4);
      for (const row of parsed.backup.tables.holiday) expect([name, row.recurring]).toEqual([name, 0]);
    }
  });

  it("o format-v4.json traz o feriado manual que repete, a exceção, a margem 5 e as duas chaves novas", async () => {
    const parsed = await parseBackup(readFixture("format-v4.json"), deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    const file: BackupFile = parsed.backup;
    expect(file.formatVersion).toBe(4);
    expect(file.tables.holiday.map((r) => [r.scope, r.date, r.recurring])).toEqual([["manual", "2027-03-03", 1]]);
    expect(file.tables.date_override).toHaveLength(1);
    const settings = Object.fromEntries(file.tables.setting.map((r) => [r.key, r.value]));
    expect(settings).toMatchObject({ margin_minutes: "5", include_municipal_holidays: "false", alarms_allowed: "true" });
  });

  it("formatVersion 5 (mais nova que o app) → format_newer", () => {
    expect(migrateBackup({ formatVersion: 5 })).toMatchObject({ ok: false, problem: "format_newer" });
  });
});

describe("E-08 (e), T-79: margem que vem de backup", () => {
  const settingRow = (value: string) => ({
    id: "s-margin", created_at: 1, updated_at: 1, deleted_at: null, source: "user", key: "margin_minutes", value,
  });
  const input = (value: string): BackupInput => ({
    schemaVersion: 4, appVersion: "1.0.0", exportedAt: Date.UTC(2026, 9, 25, 7, 0, 0), network: null, datasets: [MOBILIS], tables: { setting: [settingRow(value)] }, officialEdits: {},
  });
  const imported = async (value: string) => {
    const parsed = await parseBackup(await serializeBackup(input(value), sha256), deps);
    if (!parsed.ok) throw new Error(`${parsed.problem}: ${parsed.detail}`);
    return parsed.backup.tables.setting[0]!.value;
  };

  it("40 → 10, -3 → 0, texto ou fração → 2, valor bom fica como está", async () => {
    expect(await imported("40")).toBe("10");
    expect(await imported("-3")).toBe("0");
    expect(await imported('"muito"')).toBe("2");
    expect(await imported("2.5")).toBe("2");
    expect(await imported("nao e json")).toBe("2");
    expect(await imported("7")).toBe("7");
    expect(await imported("0")).toBe("0");
  });

  it("só a margem é mexida: outra chave do setting passa intacta", async () => {
    const other = { ...settingRow("[1,2]"), id: "s-recent", key: "recent_stops" };
    const text = await serializeBackup({ ...input("40"), tables: { setting: [settingRow("40"), other] } }, sha256);
    const parsed = await parseBackup(text, deps);
    if (!parsed.ok) throw new Error(parsed.detail);
    expect(parsed.backup.tables.setting.map((r) => [r.key, r.value])).toEqual([["margin_minutes", "10"], ["recent_stops", "[1,2]"]]);
  });
});

describe("clampMargin", () => {
  it("inteiro de 0 a 10; qualquer outra coisa volta ao padrão (2)", () => {
    expect([0, 1, 5, 10].map(clampMargin)).toEqual([0, 1, 5, 10]);
    expect([11, 40, 1e9].map(clampMargin)).toEqual([10, 10, 10]);
    expect([-1, -3].map(clampMargin)).toEqual([0, 0]);
    expect([2.5, "5", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, {}].map(clampMargin)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });
});
