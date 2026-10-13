/// <reference types="node" />
// E-08.5 bloco 6: a data do último backup (D-187) entra na mesma transação da importação. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { serializeBackup, type BackupFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { fixture, type Fixture } from "../data/registroFixture";
import { LAST_EXPORT_AT, importBackup, readBackupInput, readSettingNumber, writeSettingNumber } from "./backup";
import type { ImportDb } from "./importMobilis";
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

const isLastExportWrite = (sql: string, params: (string | number | null)[]) =>
  /^(INSERT INTO|UPDATE) setting\b/.test(sql) && params.includes(LAST_EXPORT_AT);

type Spy = { db: ImportDb; log: string[] };

/** Repassa tudo ao banco real; só registra os comandos e lança o erro que o teste mandar. */
function spy(f: Fixture, failOn?: { exec?: string; lastExportWrite?: true }): Spy {
  const log: string[] = [];
  const db: ImportDb = {
    ...f.raw,
    exec: async (sql) => {
      log.push(`exec ${sql}`);
      if (failOn?.exec === sql) throw new Error("falha forçada no exec");
      return f.raw.exec(sql);
    },
    run: async (sql, params) => {
      const isWrite = isLastExportWrite(sql, params);
      log.push(isWrite ? "run LAST_EXPORT_AT" : "run");
      if (isWrite && failOn?.lastExportWrite) throw new Error("falha forçada na data");
      return f.raw.run(sql, params);
    },
  };
  return { db, log };
}

const importVia = (db: ImportDb, file: BackupFile, now: number) => importBackup(db, file, { backups: noBackups, now });

describe("a data do último backup entra na mesma transação da importação (E-08.5 bloco 6)", () => {
  it("ordem: BEGIN, depois a gravação de last_export_at, e o único COMMIT é o último comando", async () => {
    const dst = await fixture();
    const { db, log } = spy(dst);
    await importVia(db, await fileExportedAt(), FILE_AT + 60_000);

    const begin = log.indexOf("exec BEGIN IMMEDIATE");
    const write = log.indexOf("run LAST_EXPORT_AT");
    const commit = log.indexOf("exec COMMIT");
    expect(begin, "BEGIN IMMEDIATE não registrado").toBeGreaterThan(-1);
    expect(write, "gravação de last_export_at não registrada").toBeGreaterThan(begin);
    expect(commit, "COMMIT deve vir depois da gravação de last_export_at").toBeGreaterThan(write);
    expect(log.filter((c) => c === "exec COMMIT"), "deve haver exatamente um COMMIT").toHaveLength(1);
    expect(log.at(-1), "o COMMIT deve ser o último comando").toBe("exec COMMIT");
    expect(log.filter((c) => c === "run LAST_EXPORT_AT"), "last_export_at gravado uma vez só").toHaveLength(1);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
  });

  it("falha ao gravar last_export_at: rejeita, nenhuma linha do arquivo entra e a data fica como estava", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    const before = snapshot(dst);
    const { db, log } = spy(dst, { lastExportWrite: true });

    await expect(importVia(db, await fileExportedAt(), FILE_AT + 60_000)).rejects.toThrow(/falha forçada na data/);

    expect(snapshot(dst), "linhas do arquivo entraram apesar da falha").toEqual(before);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT - DAY);
    expect(log.at(-1), "depois da falha o último comando deve ser o ROLLBACK").toBe("exec ROLLBACK");
    expect(log, "não pode haver COMMIT").not.toContain("exec COMMIT");
  });

  it("depois da falha o banco não ficou em transação aberta: a mesma importação, sem falha, conclui e grava a data", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    const file = await fileExportedAt();
    await expect(importVia(spy(dst, { lastExportWrite: true }).db, file, FILE_AT + 60_000)).rejects.toThrow();

    await expect(dst.registro.exclusive(() => importVia(dst.raw, file, FILE_AT + 60_000))).resolves.toBeDefined();
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT);
  });

  it("falha no COMMIT: rejeita, nenhuma linha do arquivo fica e a data fica como estava", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT - DAY, 1, () => "id-t0");
    const before = snapshot(dst);
    const { db, log } = spy(dst, { exec: "COMMIT" });

    await expect(importVia(db, await fileExportedAt(), FILE_AT + 60_000)).rejects.toThrow(/falha forçada no exec/);

    expect(snapshot(dst), "linhas do arquivo ficaram apesar da falha no COMMIT").toEqual(before);
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT - DAY);
    expect(log.at(-1), "depois da falha no COMMIT o último comando deve ser o ROLLBACK").toBe("exec ROLLBACK");
  });

  it("aparelho com data maior que a do arquivo: não grava a chave e o COMMIT continua sendo o último comando", async () => {
    const dst = await fixture();
    await writeSettingNumber(dst.raw, LAST_EXPORT_AT, FILE_AT + DAY, 1, () => "id-t2");
    const { db, log } = spy(dst);
    await importVia(db, await fileExportedAt(), FILE_AT + 2 * DAY);

    expect(log, "a regra max não pode gravar last_export_at à toa").not.toContain("run LAST_EXPORT_AT");
    expect(log.filter((c) => c === "exec COMMIT")).toHaveLength(1);
    expect(log.at(-1)).toBe("exec COMMIT");
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBe(FILE_AT + DAY);
  });
});
