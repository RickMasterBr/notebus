/// <reference types="node" />
// D-187: importar herda a data do último backup do arquivo. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { backupReminder, serializeBackup, type BackupFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { fixture, type Fixture } from "../data/registroFixture";
import { LAST_EXPORT_AT, importBackup, readBackupInput, readReminderState, readSettingNumber, undoImport, writeSettingNumber } from "./backup";
import type { BackupStore } from "./migrate";
import { tables } from "./schema";
import { SCENARIO_NOW, backupScenario } from "./testing/backupScenario";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const DAY = 86_400_000;
/** O arquivo guarda `exportedAt` em segundos inteiros (ISO). */
const FILE_AT = SCENARIO_NOW - (SCENARIO_NOW % 1000);
const all = (f: Fixture, sql: string, params: (string | number | null)[] = []) => f.raw.all(sql, params) as Record<string, unknown>[];

const noBackups: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

function snapshot(f: Fixture) {
  return Object.fromEntries(
    Object.values(tables).map((t) => {
      const name = getTableConfig(t as never).name;
      return [name, all(f, `SELECT * FROM \`${name}\` ORDER BY id`)];
    }),
  );
}

/** Arquivo exportado em `exportedAt` (segundos), já lido e validado. */
async function fileExportedAt(exportedAt = FILE_AT): Promise<BackupFile> {
  const src = await backupScenario();
  const text = await serializeBackup(await readBackupInput(src.raw, { now: exportedAt, appVersion: "1.0.0" }), sha256);
  const preview = await prepareImport((await fixture()).raw, text, sha256);
  if (!preview.ok) throw new Error(preview.problem);
  return preview.file;
}

const doImport = (f: Fixture, file: BackupFile, now: number) => f.registro.exclusive(() => importBackup(f.raw, file, { backups: noBackups, now }));
const lastExportRow = (f: Fixture) => all(f, "SELECT * FROM setting WHERE `key` = ?", [LAST_EXPORT_AT]);

describe("importar herda a data do último backup (D-187)", () => {
  it("aparelho sem a data: passa a ser a do arquivo", async () => {
    const dst = await fixture();
    await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
    expect((await readReminderState(dst.raw)).lastExportAt).toBe(FILE_AT);
  });

  it("aparelho com data maior que a do arquivo: continua a do aparelho", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT + DAY, 1, () => "id-t2");
    await doImport(dst, await fileExportedAt(), FILE_AT + 2 * DAY);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT + DAY);
  });

  it("aparelho com data menor que a do arquivo: passa a do arquivo", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
  });

  it("arquivo com data no futuro: grava o agora da importação", async () => {
    const dst = await fixture();
    const now = FILE_AT - 5 * DAY;
    await doImport(dst, await fileExportedAt(), now);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(now);
  });

  it("data do arquivo ilegível: nada gravado e sem erro", async () => {
    const dst = await fixture();
    const file = { ...(await fileExportedAt()), exportedAt: "nao-e-data" };
    await expect(doImport(dst, file, FILE_AT + 60_000)).resolves.toBeDefined();
    expect(lastExportRow(dst)).toEqual([]);
  });

  it("o mesmo arquivo duas vezes: a segunda não altera nenhuma linha", async () => {
    const dst = await fixture();
    const file = await fileExportedAt();
    await doImport(dst, file, FILE_AT + 60_000);
    const before = snapshot(dst);
    await doImport(dst, file, FILE_AT + 120_000);
    expect(snapshot(dst)).toEqual(before);
  });

  it("não entra nos totais da importação", async () => {
    const dst = await fixture();
    const outcome = await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(outcome.summary).toEqual({ inserted: 7 + 6 + 1 + 1 + 2, replaced: 1, kept: 0 });
  });

  it("Desfazer sem a chave de antes: a linha some e o banco é o de antes", async () => {
    const dst = await fixture();
    const before = snapshot(dst);
    const outcome = await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(lastExportRow(dst)).toHaveLength(1);
    await dst.registro.exclusive(() => undoImport(dst.raw, outcome.undo));
    expect(lastExportRow(dst)).toEqual([]);
    expect(snapshot(dst)).toEqual(before);
  });

  it("Desfazer com a chave de antes (T0): volta a T0, linha igual à de antes", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    const rowBefore = lastExportRow(dst);
    const before = snapshot(dst);
    const outcome = await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
    await dst.registro.exclusive(() => undoImport(dst.raw, outcome.undo));
    expect(lastExportRow(dst)).toEqual(rowBefore);
    expect(snapshot(dst)).toEqual(before);
  });

  it("Desfazer com a chave apagada de antes: volta apagada", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    dst.raw.run("UPDATE setting SET deleted_at = 5 WHERE `key` = ?", [LAST_EXPORT_AT]);
    const before = snapshot(dst);
    const outcome = await doImport(dst, await fileExportedAt(), FILE_AT + 60_000);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
    await dst.registro.exclusive(() => undoImport(dst.raw, outcome.undo));
    expect(snapshot(dst)).toEqual(before);
  });

  it("importação que falha no meio: a data não muda", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    const before = snapshot(dst);
    let runs = 0;
    const failing = { ...dst.raw, run: async (sql: string, params: (string | number | null)[]) => {
      if (sql.startsWith("INSERT INTO `ride`") && ++runs === 2) throw new Error("falha forçada");
      return dst.raw.run(sql, params);
    } };
    await expect(importBackup(failing, await fileExportedAt(), { backups: noBackups, now: FILE_AT + 60_000 })).rejects.toThrow(/falha forçada/);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT - DAY);
    expect(snapshot(dst)).toEqual(before);
  });
});

describe("o cartão de backup depois de importar (D-187)", () => {
  it("aparelho vazio + arquivo exportado há 1 dia + registros importados: não mostra, há 1 dia", async () => {
    const dst = await fixture();
    const now = FILE_AT + DAY;
    await doImport(dst, await fileExportedAt(), now);
    const state = await readReminderState(dst.raw);
    expect(state.hasRecords).toBe(true);
    expect(backupReminder({ now, ...state })).toEqual({ show: false, daysSince: 1 });
  });

  it("arquivo exportado há 8 dias e registro mais novo no aparelho: mostra, há 8 dias (efeito esperado)", async () => {
    const dst = await fixture();
    const now = FILE_AT + 8 * DAY;
    await doImport(dst, await fileExportedAt(), now);
    dst.raw.run("UPDATE observation SET updated_at = ? WHERE id = (SELECT id FROM observation LIMIT 1)", [FILE_AT + DAY]);
    const state = await readReminderState(dst.raw);
    expect(backupReminder({ now, ...state })).toEqual({ show: true, daysSince: 8 });
  });
});
