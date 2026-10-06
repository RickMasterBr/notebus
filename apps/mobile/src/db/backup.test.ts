/// <reference types="node" />
// Backup no banco (E-03 §5, T-23 a T-25): exportar, importar que junta, Desfazer. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  BACKUP_SETTING_KEYS,
  BACKUP_TABLES,
  BACKUP_V1_COLUMNS,
  type BackupFile,
  backupReminder,
  parseBackup,
  serializeBackup,
  snoozeUntil,
} from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ExportIO, exportBackup, prepareImport } from "../data/backupFlow";
import { fixture, type Fixture } from "../data/registroFixture";
import { BACKUP_REMINDER_SNOOZED_UNTIL, LAST_EXPORT_AT, importBackup, readBackupInput, readReminderState, readSettingNumber, undoImport, writeSettingNumber } from "./backup";
import type { BackupStore } from "./migrate";
import { tables } from "./schema";
import { SCENARIO_NOW, backupScenario } from "./testing/backupScenario";
import { createPlaces } from "./places";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const APP = "1.0.0";
/** O SQL cru dos testes é síncrono (node:sqlite). */
const all = (f: Fixture, sql: string, params: (string | number | null)[] = []) => f.raw.all(sql, params) as Record<string, unknown>[];

/** Cópias do banco em memória: só registra o nome (a cópia de verdade é a do E-01, provada em `migrate.test.ts`). */
function memoryBackups(): BackupStore & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    create: async (name) => void names.push(name),
    restore: async () => {},
    list: async () => [...names],
    remove: async (name) => void names.splice(names.indexOf(name), 1),
  };
}

async function exportText(f: Fixture, now = SCENARIO_NOW): Promise<string> {
  return serializeBackup(await readBackupInput(f.raw, { now, appVersion: APP }), sha256);
}

/** Tudo do banco que é do usuário (o que o backup cobre), tabela por tabela, para comparar. */
function userRows(f: Fixture): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) {
    const settingOnly = t === "setting" ? ` AND \`key\` IN (${BACKUP_SETTING_KEYS.map((k) => `'${k}'`).join(", ")})` : "";
    out[t] = all(f, `SELECT * FROM \`${t}\` WHERE source <> 'official'${settingOnly} ORDER BY id`, []) as Record<string, unknown>[];
  }
  return out;
}
/** O banco inteiro (todas as tabelas), para provar "intacto". */
function snapshot(f: Fixture) {
  return Object.fromEntries(
    Object.values(tables).map((t) => {
      const name = getTableConfig(t as never).name;
      return [name, all(f, `SELECT * FROM \`${name}\` ORDER BY id`, [])];
    }),
  );
}

async function importText(f: Fixture, text: string, now = SCENARIO_NOW + 60_000) {
  const preview = await prepareImport(f.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  const outcome = await f.registro.exclusive(() => importBackup(f.raw, preview.file, { backups: memoryBackups(), now }));
  return { preview, outcome };
}

describe("contrato do formato v1 contra o esquema (D-090)", () => {
  it("cada tabela do backup tem exatamente as colunas do esquema, na mesma ordem", () => {
    const schema = Object.fromEntries(Object.values(tables).map((t) => {
      const c = getTableConfig(t as never);
      return [c.name, c.columns.map((x) => x.name)];
    }));
    for (const t of BACKUP_TABLES) expect([t, BACKUP_V1_COLUMNS[t]]).toEqual([t, schema[t]]);
    // Toda tabela do esquema está no backup, menos `dataset` (fato da importação da MOBILIS).
    expect(Object.keys(schema).filter((t) => !(BACKUP_TABLES as string[]).includes(t))).toEqual(["dataset"]);
  });
});

describe("T-23: ida e volta", () => {
  it("todos os tipos → exportar → banco vazio com a rede de teste → importar: mesmos fatos, ids e deduções", async () => {
    const src = await backupScenario();
    const before = userRows(src);
    // O cenário tem mesmo todos os tipos.
    const obs = before.observation!;
    expect(new Set(obs.map((o) => o.kind))).toEqual(new Set(["boarded", "passed", "alighted"]));
    expect(new Set(obs.filter((o) => o.deleted_at === null).map((o) => o.match_status))).toEqual(new Set(["auto", "manual", "ambiguous", "orphan"]));
    expect(obs.filter((o) => o.deleted_at !== null)).toHaveLength(1);
    expect(new Set(before.ride!.map((r) => r.status))).toEqual(new Set(["open", "closed", "dismissed"]));
    expect([before.place, before.walk_time, before.stop].map((x) => x!.length)).toEqual([1, 1, 1]);

    const text = await exportText(src);
    const dst = await fixture();
    const { preview, outcome } = await importText(dst, text);
    expect(preview.ok && [preview.records, preview.places, preview.datasets, preview.date]).toEqual([7, 1, ["2026-01-01"], "08/10/2026"]);
    // 7 registros, 6 rides, 1 lugar, 1 tempo a pé, 2 preferências entram; a edição oficial substitui a Arrabalde intacta.
    expect(outcome.summary).toEqual({ inserted: 7 + 6 + 1 + 1 + 2, replaced: 1, kept: 0 }); // a edição oficial substitui
    // A fila refaz as deduções (o cenário deduziu no mesmo instante, então tudo fica igual, coluna a coluna).
    await dst.registro.refreshDeductions(SCENARIO_NOW);
    const after = userRows(dst);
    for (const t of BACKUP_TABLES) expect([t, after[t]]).toEqual([t, before[t]]);
    // Estado do aparelho não veio.
    expect(await readSettingNumber(dst.raw, LAST_EXPORT_AT)).toBeNull();
    expect(all(dst, "SELECT 1 FROM setting WHERE `key` = 'first_run_done'", [])).toEqual([]);
  });
});

describe("T-24: arquivo alterado é recusado e o banco fica intacto", () => {
  it("1 dígito de observed_at, 1 espaço, 1 letra do format, o último caractere, truncado", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    const at = text.indexOf('"observed_at": ') + '"observed_at": '.length + 5;
    const cases: [string, string][] = [
      ["checksum_mismatch", text.slice(0, at) + (text[at] === "1" ? "2" : "1") + text.slice(at + 1)],
      ["checksum_mismatch", text.replace('"kind": "passed"', '"kind":  "passed"')],
      ["not_backup", text.replace('"format": "notebus-backup"', '"format": "notebus-backuq"')],
      ["checksum_mismatch", text.slice(0, -1)],
      ["not_json", text.slice(0, Math.floor(text.length * 0.7))],
    ];
    const before = snapshot(dst);
    for (const [problem, changed] of cases) {
      expect(changed).not.toBe(text);
      const r = await prepareImport(dst.raw, changed, sha256);
      expect(r).toMatchObject({ ok: false, problem });
    }
    expect(snapshot(dst)).toEqual(before);
  });

  it("formatVersion 99, format errado e MOBILIS ausente: código certo e nada gravado", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    const resign = (file: Record<string, unknown>) => {
      const zero = `sha256:${"0".repeat(64)}`;
      const t = `${JSON.stringify({ ...file, checksum: zero }, null, 2)}\n`;
      return t.replace(zero, `sha256:${sha256(t)}`);
    };
    const file = JSON.parse(text);
    const before = snapshot(dst);
    expect(await prepareImport(dst.raw, resign({ ...file, formatVersion: 99 }), sha256)).toMatchObject({ ok: false, problem: "format_newer" });
    expect(await prepareImport(dst.raw, resign({ ...file, format: "outra-coisa" }), sha256)).toMatchObject({ ok: false, problem: "not_backup" });
    const other = resign({ ...file, datasets: [{ name: "exemplo", version: "2099-01-01" }] });
    expect(await prepareImport(dst.raw, other, sha256)).toMatchObject({ ok: false, problem: "dataset_missing", missing: [{ name: "exemplo", version: "2099-01-01" }] });
    expect(snapshot(dst)).toEqual(before);
  });
});

/** Um registro inventado com os campos mínimos. */
function insertObs(f: Fixture, id: string, updated: number, note: string | null = null) {
  f.raw.run(
    "INSERT INTO observation (id, created_at, updated_at, source, stop_id, line_id, observed_at, kind, mode, recorded_at, note) VALUES (?, ?, ?, 'user', 'stop-x', 'line-x', ?, 'boarded', 'live', ?, ?)",
    [id, updated, updated, updated, updated, note],
  );
}

describe("T-25: juntar, nunca apagar (D-089)", () => {
  const SUN = Date.UTC(2026, 9, 4, 7), MON = SUN + 86_400_000, TUE = MON + 86_400_000;
  it("backup de domingo (A, B) num app com segunda e terça (C, D) e B editada depois: A, B, C, D ficam; B a mais nova", async () => {
    const sunday = await fixture();
    insertObs(sunday, "A", SUN, "domingo");
    insertObs(sunday, "B", SUN + 60_000, "domingo");
    const text = await exportText(sunday, SUN + 3_600_000);

    const app = await fixture();
    insertObs(app, "B", TUE + 1, "editada na terça");
    insertObs(app, "C", MON, "segunda");
    insertObs(app, "D", TUE, "terça");
    const { outcome } = await importText(app, text, TUE + 2);
    expect(outcome.summary).toEqual({ inserted: 1, replaced: 0, kept: 1 });
    const rows = all(app, "SELECT id, note FROM observation ORDER BY id", []);
    expect(rows).toEqual([
      { id: "A", note: "domingo" },
      { id: "B", note: "editada na terça" },
      { id: "C", note: "segunda" },
      { id: "D", note: "terça" },
    ]);

    // Com a B do arquivo mais nova, vale a do arquivo; ainda nada some.
    const older = await fixture();
    insertObs(older, "B", SUN, "antiga no app");
    insertObs(older, "C", MON, "segunda");
    const { outcome: o2 } = await importText(older, text, TUE);
    expect(o2.summary).toEqual({ inserted: 1, replaced: 1, kept: 0 });
    expect(all(older, "SELECT id, note FROM observation ORDER BY id", [])).toEqual([
      { id: "A", note: "domingo" },
      { id: "B", note: "domingo" },
      { id: "C", note: "segunda" },
    ]);
  });
});

describe("importar duas vezes, Desfazer, manual e órfãos", () => {
  it("o mesmo arquivo duas vezes: a segunda não muda nada", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    await importText(dst, text);
    await dst.registro.refreshDeductions(SCENARIO_NOW + 120_000);
    const once = snapshot(dst);
    const { outcome } = await importText(dst, text, SCENARIO_NOW + 180_000);
    expect(outcome.summary.inserted + outcome.summary.replaced).toBe(0);
    await dst.registro.refreshDeductions(SCENARIO_NOW + 240_000);
    expect(snapshot(dst)).toEqual(once);
  });

  it("importar o mesmo backup duas vezes e recalcular duas vezes deixa os updated_at idênticos", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    await importText(dst, text, SCENARIO_NOW + 10_000);
    await dst.registro.refreshDeductions(SCENARIO_NOW + 20_000);
    const beforeObs = all(dst, "SELECT id, updated_at FROM observation ORDER BY id");
    const beforeRides = all(dst, "SELECT id, updated_at FROM ride ORDER BY id");
    // Segunda importação e segundo recálculo em instantes futuros
    await importText(dst, text, SCENARIO_NOW + 30_000);
    await dst.registro.refreshDeductions(SCENARIO_NOW + 40_000);
    const afterObs = all(dst, "SELECT id, updated_at FROM observation ORDER BY id");
    const afterRides = all(dst, "SELECT id, updated_at FROM ride ORDER BY id");
    expect(afterObs).toEqual(beforeObs);
    expect(afterRides).toEqual(beforeRides);
  });

  it("Desfazer volta o banco ao estado de antes, inclusive as linhas substituídas e depois de a fila refazer as deduções", async () => {
    const src = await backupScenario();
    const text = await exportText(src);
    const dst = await fixture();
    // Uma versão mais velha de um registro do arquivo: vai ser substituída.
    const b1 = all(src, "SELECT * FROM observation WHERE id = ?", [src.ids.b1!])[0] as Record<string, unknown>;
    const cols = Object.keys(b1);
    dst.raw.run(`INSERT INTO observation (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => (c === "updated_at" ? 1 : c === "note" ? "antes" : b1[c]) as never));
    const before = snapshot(dst);
    const { outcome } = await importText(dst, text);
    expect(outcome.summary.replaced).toBeGreaterThanOrEqual(2); // o registro e a edição oficial
    await dst.registro.refreshDeductions(SCENARIO_NOW + 120_000);
    expect(snapshot(dst)).not.toEqual(before);
    await dst.registro.exclusive(() => undoImport(dst.raw, outcome.undo));
    expect(snapshot(dst)).toEqual(before);
  });

  it("manual do arquivo nunca é recalculado; órfão entra e aparece na lista", async () => {
    const src = await backupScenario();
    // Um registro que aponta para um ponto que "a MOBILIS mudou".
    src.raw.run("UPDATE observation SET stop_id = 'ponto-que-sumiu' WHERE id = ?", [src.ids.b2!]);
    const text = await exportText(src);
    const dst = await fixture();
    const { preview, outcome } = await importText(dst, text);
    expect(preview.ok && preview.orphans).toEqual([{ table: "observation", id: src.ids.b2, column: "stop_id", missing: "ponto-que-sumiu" }]);
    expect(outcome.orphans).toHaveLength(1);
    expect(all(dst, "SELECT stop_id FROM observation WHERE id = ?", [src.ids.b2!])).toEqual([{ stop_id: "ponto-que-sumiu" }]);
    expect(outcome.requeued).toBe(5); // vivos e não manuais: b1, descida, b2, b3, b4 (b3m é manual, b5 está apagado)
    await dst.registro.refreshDeductions(SCENARIO_NOW + 999_000);
    const manual = all(dst, "SELECT match_status, trip_id, deviation_min, updated_at FROM observation WHERE id = ?", [src.ids.b3m!])[0];
    const orig = all(src, "SELECT match_status, trip_id, deviation_min, updated_at FROM observation WHERE id = ?", [src.ids.b3m!])[0];
    expect(manual).toEqual(orig);
  });

  it("falha no meio da gravação: a transação volta inteira", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    const preview = await prepareImport(dst.raw, text, sha256);
    if (!preview.ok) throw new Error(preview.problem);
    const before = snapshot(dst);
    let runs = 0;
    const failing = { ...dst.raw, run: async (sql: string, params: (string | number | null)[]) => {
      if (sql.startsWith("INSERT INTO `ride`") && ++runs === 2) throw new Error("falha forçada");
      return dst.raw.run(sql, params);
    } };
    await expect(importBackup(failing, preview.file, { backups: memoryBackups(), now: SCENARIO_NOW })).rejects.toThrow(/falha forçada/);
    expect(snapshot(dst)).toEqual(before);
  });

  it("cópia do banco antes de gravar, pelo mesmo mecanismo das migrações (nome com a data e 'import')", async () => {
    const text = await exportText(await backupScenario());
    const dst = await fixture();
    const preview = await prepareImport(dst.raw, text, sha256);
    if (!preview.ok) throw new Error(preview.problem);
    const backups = memoryBackups();
    const outcome = await importBackup(dst.raw, preview.file, { backups, now: Date.UTC(2026, 9, 25, 8, 14) });
    expect(backups.names).toEqual(["notebus-backup-2026-10-25T08-14-00-000Z-import.db"]);
    expect(outcome.copyName).toBe(backups.names[0]);
  });
});

describe("exportar (§5.3)", () => {
  function fakeIO(over: Partial<ExportIO> = {}) {
    const files = new Map<string, string>();
    const shared: string[] = [];
    const io: ExportIO = {
      write: async (name, text) => (files.set(`file:///cache/${name}`, text), `file:///cache/${name}`),
      read: async (uri) => files.get(uri)!,
      share: async (uri) => void shared.push(uri),
      ...over,
    };
    return { io, files, shared };
  }
  const newId = () => "set-last-export";
  const at = Date.UTC(2026, 9, 25, 8, 14, 2); // 25/10/2026 08:14 em Lisboa (já em hora de inverno, UTC+0)

  it("grava, relê, confere, compartilha e só então grava last_export_at; nome com a hora de Lisboa", async () => {
    const f = await backupScenario();
    const { io, shared, files } = fakeIO();
    const r = await exportBackup(f.raw, { now: at, appVersion: APP, sha256, io, newId });
    expect(r).toMatchObject({ ok: true, fileName: "notebus-backup-2026-10-25-0814.json" });
    expect(shared).toEqual(["file:///cache/notebus-backup-2026-10-25-0814.json"]);
    expect(await readSettingNumber(f.raw, LAST_EXPORT_AT)).toBe(at);
    const text = files.get(shared[0]!)!;
    expect((await parseBackup(text, { sha256, installedDatasets: [{ name: "exemplo", version: "2026-01-01" }] })).ok).toBe(true);
  });

  it("arquivo adulterado depois de gravar: não abre a folha de compartilhar e last_export_at não muda", async () => {
    const f = await backupScenario();
    const lastBefore = await readSettingNumber(f.raw, LAST_EXPORT_AT);
    const { io, shared } = fakeIO({ read: async () => "{\"format\": \"notebus-backup\", \"checksum\": \"sha256:x\"}" });
    const r = await exportBackup(f.raw, { now: at, appVersion: APP, sha256, io, newId });
    expect(r).toMatchObject({ ok: false, stage: "verify" });
    expect(shared).toEqual([]);
    expect(await readSettingNumber(f.raw, LAST_EXPORT_AT)).toBe(lastBefore);
  });

  it("a folha de compartilhar falha ao abrir: last_export_at não muda", async () => {
    const f = await backupScenario();
    const lastBefore = await readSettingNumber(f.raw, LAST_EXPORT_AT);
    const { io } = fakeIO({ share: async () => { throw new Error("sem folha"); } });
    expect(await exportBackup(f.raw, { now: at, appVersion: APP, sha256, io, newId })).toMatchObject({ ok: false, stage: "share" });
    expect(await readSettingNumber(f.raw, LAST_EXPORT_AT)).toBe(lastBefore);
  });
});

describe("arquivos de exemplo por formatVersion (D-090, §5.6)", () => {
  const dir = join(__dirname, "../../../../packages/domain/fixtures/backup");
  it("todo arquivo em fixtures/backup confere o checksum e importa num banco com a rede de teste", async () => {
    const names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
    expect(names).toContain("format-v1.json");
    for (const name of names) {
      const text = readFileSync(join(dir, name), "utf8");
      const dst = await fixture();
      const { outcome } = await importText(dst, text);
      const counts = (JSON.parse(text) as BackupFile).counts;
      const rows = Object.values(counts).reduce((a, b) => a + b, 0);
      // Banco novo: tudo entra (o dado oficial editado substitui o oficial intacto).
      expect([name, outcome.summary.inserted + outcome.summary.replaced, outcome.summary.kept]).toEqual([name, rows, 0]);
    }
  });

  it("o format-v1.json é exatamente o que o exportador de hoje gera do cenário (formato mudou sem subir a versão → quebra)", async () => {
    const text = await exportText(await backupScenario());
    // Gerar de novo (só ao criar uma formatVersion nova): NOTEBUS_WRITE_BACKUP_FIXTURE=1 npx vitest run src/db/backup.test.ts
    if (process.env.NOTEBUS_WRITE_BACKUP_FIXTURE === "1") writeFileSync(join(dir, "format-v1.json"), text);
    expect(text).toBe(readFileSync(join(dir, "format-v1.json"), "utf8"));
  });
});

describe("A8 pelo banco: lembrete com data simulada (D-088)", () => {
  it("export há 8 dias e um registro novo depois → aparece \"há 8 dias\"; \"Agora não\" esconde 2 dias", async () => {
    const f = await backupScenario(); // último export: um dia antes do cenário; os registros são de depois dele
    const DAY = 86_400_000;
    const exportedAt = SCENARIO_NOW - DAY;
    const state = await readReminderState(f.raw);
    expect(state).toEqual({ lastExportAt: exportedAt, snoozedUntil: null, hasRecords: true, recordsUpdatedSinceExport: true });
    expect(backupReminder({ now: exportedAt + 7 * DAY, ...state })).toEqual({ show: false, daysSince: 7 });
    expect(backupReminder({ now: exportedAt + 8 * DAY, ...state })).toEqual({ show: true, daysSince: 8 });
    const later = exportedAt + 8 * DAY;
    await writeSettingNumber(f.raw, BACKUP_REMINDER_SNOOZED_UNTIL, snoozeUntil(later), later, () => "set-snooze");
    const snoozed = await readReminderState(f.raw);
    expect(backupReminder({ now: later + DAY, ...snoozed }).show).toBe(false);
    expect(backupReminder({ now: later + 2 * DAY, ...snoozed }).show).toBe(true);
    // Exportou depois do último registro: some.
    await writeSettingNumber(f.raw, LAST_EXPORT_AT, later + 3 * DAY, later + 3 * DAY, () => "x");
    expect(backupReminder({ now: later + 20 * DAY, ...(await readReminderState(f.raw)) }).show).toBe(false);
  });
});

describe("D-175: preferência goto_last_origin fica fora do backup", () => {
  it("com goto_last_origin gravada em setting, exportar não a inclui no arquivo, e importar num banco que já a tem não a apaga nem a sobrescreve", async () => {
    const src = await backupScenario();
    const placesRepoSrc = createPlaces(src.db);
    await placesRepoSrc.setGotoLastOrigin("place-dest", "place-src-choice", SCENARIO_NOW);

    // Confere que goto_last_origin foi gravada em setting no banco de origem
    const srcSettingRows = all(src, "SELECT * FROM setting WHERE key = 'goto_last_origin'");
    expect(srcSettingRows).toHaveLength(1);
    expect((await placesRepoSrc.getGotoLastOrigins())["place-dest"]).toBe("place-src-choice");

    // Exporta o banco
    const text = await exportText(src);

    // Prova 1: o arquivo exportado não inclui goto_last_origin
    expect(text.includes("goto_last_origin")).toBe(false);
    const parsedBackup = JSON.parse(text) as BackupFile;
    const backupSettingRows = parsedBackup.tables.setting ?? [];
    expect(backupSettingRows.some((row: any) => row.key === "goto_last_origin" || row[1] === "goto_last_origin")).toBe(false);

    // Banco de destino já possui sua própria preferência de origem
    const dst = await fixture();
    const placesRepoDst = createPlaces(dst.db);
    await placesRepoDst.setGotoLastOrigin("place-dest", "place-dst-existing", SCENARIO_NOW);

    const dstBefore = await placesRepoDst.getGotoLastOrigins();
    expect(dstBefore["place-dest"]).toBe("place-dst-existing");

    // Importa o backup no banco de destino
    await importText(dst, text);

    // Prova 2: importar não apaga nem sobrescreve goto_last_origin existente
    const dstAfter = await placesRepoDst.getGotoLastOrigins();
    expect(dstAfter["place-dest"]).toBe("place-dst-existing");

    const dstSettingRows = all(dst, "SELECT * FROM setting WHERE key = 'goto_last_origin'");
    expect(dstSettingRows).toHaveLength(1);
    expect((await placesRepoDst.getGotoLastOrigins())["place-dest"]).toBe("place-dst-existing");
  });
});

