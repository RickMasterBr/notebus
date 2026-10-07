/// <reference types="node" />
// Backup formatVersion 2 pelo banco (E-06 T-59, D-104, D-090): os avisos vão e voltam, o histórico não vai, o formato 1 segue importando.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BackupFile, serializeBackup } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { fixture } from "../data/registroFixture";
import { importBackup, readBackupInput, undoImport } from "./backup";
import type { BackupStore } from "./migrate";
import { SCENARIO_NOW, backupScenario } from "./testing/backupScenario";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FIXTURES = join(__dirname, "../../../../packages/domain/fixtures/backup");
const memoryBackups = (): BackupStore => ({ create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} });
const rows = (f: Awaited<ReturnType<typeof fixture>>, sql: string) => f.raw.all(sql, []) as Record<string, unknown>[];

async function exportText(withAlarm: boolean): Promise<string> {
  const src = await backupScenario({ withAlarm });
  return serializeBackup(await readBackupInput(src.raw, { now: SCENARIO_NOW, appVersion: "1.0.0" }), sha256);
}

async function importInto(dst: Awaited<ReturnType<typeof fixture>>, text: string) {
  const preview = await prepareImport(dst.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  return dst.registro.exclusive(() => importBackup(dst.raw, preview.file, { backups: memoryBackups(), now: SCENARIO_NOW + 60_000 }));
}

describe("T-59: avisos no backup (formatVersion 2)", () => {
  it("(a) exportar com avisos e importar num banco vazio com a rede de teste: o aviso volta igual; o Desfazer o tira", async () => {
    const text = await exportText(true);
    expect((JSON.parse(text) as BackupFile).formatVersion).toBe(2);

    const dst = await fixture();
    expect(rows(dst, "SELECT id FROM departure_alarm")).toEqual([]);
    const outcome = await importInto(dst, text);
    expect(outcome.undo.inserted.filter((i) => i.table === "departure_alarm")).toEqual([{ table: "departure_alarm", id: "alarm-facul" }]);
    expect(rows(dst, "SELECT * FROM departure_alarm")).toEqual([
      {
        id: "alarm-facul", created_at: SCENARIO_NOW, updated_at: SCENARIO_NOW, deleted_at: null, source: "user",
        option_id: "option-facul", anchor_trip_id: expect.any(String), anchor_base_minute: 492, weekdays: "[1,3,5]",
        once_date: null, valid_from: "2026-10-01", valid_to: "2027-01-31", enabled: 1,
      },
    ]);

    await undoImport(dst.raw, outcome.undo);
    expect(rows(dst, "SELECT id FROM departure_alarm")).toEqual([]);
  });

  it("aviso de uma opção que não existe no banco novo entra assim mesmo e não aparece como órfão", async () => {
    const dst = await fixture();
    const outcome = await importInto(dst, await exportText(true));
    expect(rows(dst, "SELECT option_id FROM departure_alarm")).toEqual([{ option_id: "option-facul" }]);
    expect(outcome.orphans.filter((o) => (o.table as string) === "departure_alarm")).toEqual([]);
  });

  it("(c) o evento do aviso (alarm_event) existe no banco de origem mas não vai no arquivo", async () => {
    const src = await backupScenario({ withAlarm: true });
    expect(rows(src, "SELECT id FROM alarm_event")).toEqual([{ id: "alarm-event-1" }]);
    const text = await exportText(true);
    expect(text).not.toContain("alarm_event");
    expect(text).not.toContain("alarm-event-1");
    const dst = await fixture();
    await importInto(dst, text);
    expect(rows(dst, "SELECT id FROM alarm_event")).toEqual([]);
  });

  it("(b) o format-v1.json continua importando, sem avisos (D-090); o format-v2.json traz o aviso", async () => {
    const dst = await fixture();
    const v1 = readFileSync(join(FIXTURES, "format-v1.json"), "utf8");
    expect((JSON.parse(v1) as BackupFile).formatVersion).toBe(1);
    const outcome = await importInto(dst, v1);
    expect(outcome.summary.inserted + outcome.summary.replaced).toBeGreaterThan(0);
    expect(rows(dst, "SELECT id FROM departure_alarm")).toEqual([]);

    const v2 = readFileSync(join(FIXTURES, "format-v2.json"), "utf8");
    expect((JSON.parse(v2) as BackupFile).counts.departure_alarm).toBe(1);
  });

  it("(d) arquivo v2 adulterado é recusado pelo checksum, como antes, e nada é gravado", async () => {
    const dst = await fixture();
    const text = (await exportText(true)).replace('"anchor_base_minute": 492', '"anchor_base_minute": 493');
    expect(await prepareImport(dst.raw, text, sha256)).toMatchObject({ ok: false, problem: "checksum_mismatch" });
    expect(rows(dst, "SELECT id FROM departure_alarm")).toEqual([]);
  });

  it("importar o mesmo arquivo duas vezes não duplica o aviso (junção pelo id)", async () => {
    const dst = await fixture();
    const text = await exportText(true);
    await importInto(dst, text);
    await importInto(dst, text);
    expect(rows(dst, "SELECT id FROM departure_alarm")).toHaveLength(1);
  });
});
