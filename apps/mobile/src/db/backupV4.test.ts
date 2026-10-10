/// <reference types="node" />
// Backup formatVersion 4 no banco (E-08, T-79, T-86, D-090): feriado seu que repete, exceção e as preferências fazem a ida e volta.
// Dados inventados (D-091).
import { createHash } from "node:crypto";
import { type BackupFile, serializeBackup } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { fixture, type Fixture } from "../data/registroFixture";
import { importBackup, readBackupInput } from "./backup";
import type { BackupStore } from "./migrate";
import { SCENARIO_NOW, backupScenario } from "./testing/backupScenario";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const all = (f: Fixture, sql: string) => f.raw.all(sql, []) as Record<string, unknown>[];

const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };
const exportText = async (f: Fixture) => serializeBackup(await readBackupInput(f.raw, { now: SCENARIO_NOW, appVersion: "1.0.0" }), sha256);
const scenarioV4 = () => backupScenario({ withAlarm: true, withLocation: true, withCalendar: true });

async function importText(f: Fixture, text: string) {
  const preview = await prepareImport(f.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  return f.registro.exclusive(() => importBackup(f.raw, preview.file, { backups: noCopies, now: SCENARIO_NOW + 60_000 }));
}

/** O que a E-08 grava no calendário e nas preferências, de tudo que o backup cobre. */
const calendarRows = (f: Fixture) => ({
  holiday: all(f, "SELECT id, source, date, name, scope, recurring FROM holiday WHERE source = 'user' ORDER BY id"),
  override: all(f, "SELECT id, source, date, note FROM date_override WHERE source = 'user' ORDER BY id"),
  setting: all(
    f,
    "SELECT key, value FROM setting WHERE key IN ('margin_minutes', 'include_municipal_holidays', 'alarms_allowed') ORDER BY key",
  ),
});

describe("T-86 (dados): ida e volta do backup com o calendário e as preferências", () => {
  it("o cenário tem o feriado manual que repete, a exceção, a margem 5 e as duas chaves novas", async () => {
    expect(calendarRows(await scenarioV4())).toEqual({
      holiday: [{ id: "holiday-3-marco", source: "user", date: "2027-03-03", name: "3 de março", scope: "manual", recurring: 1 }],
      override: [{ id: "override-natal", source: "user", date: "2026-12-26", note: "ponte" }],
      setting: [
        { key: "alarms_allowed", value: "true" },
        { key: "include_municipal_holidays", value: "false" },
        { key: "margin_minutes", value: "5" },
      ],
    });
  });

  it("exportar, apagar (banco novo com a MOBILIS), importar: tudo volta igual, inclusive recurring = 1", async () => {
    const src = await scenarioV4();
    const before = calendarRows(src);
    const text = await exportText(src);
    expect((JSON.parse(text) as BackupFile).tables.holiday[0]).toMatchObject({ scope: "manual", recurring: 1 });

    const dst = await fixture();
    expect(calendarRows(dst).holiday).toEqual([]);
    await importText(dst, text);
    expect(calendarRows(dst)).toEqual(before);
  });

  it("importar margem 40 de um arquivo grava 10; -3 grava 0 (T-79)", async () => {
    for (const [given, expected] of [["40", "10"], ["-3", "0"], ['"abc"', "2"]] as const) {
      const src = await scenarioV4();
      await src.raw.run("UPDATE setting SET value = ? WHERE key = 'margin_minutes'", [given]);
      const dst = await fixture();
      await importText(dst, await exportText(src));
      expect([given, calendarRows(dst).setting.find((r) => r.key === "margin_minutes")?.value]).toEqual([given, expected]);
    }
  });

  it("um backup sem as chaves novas (v3) deixa o padrão: nada de include_municipal_holidays nem alarms_allowed no banco", async () => {
    const src = await backupScenario({ withAlarm: true, withLocation: true });
    const dst = await fixture();
    await importText(dst, await exportText(src));
    expect(calendarRows(dst).setting.map((r) => r.key)).toEqual(["margin_minutes"]);
  });
});
