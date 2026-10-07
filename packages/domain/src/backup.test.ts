/// <reference types="node" />
// Formato, validação, junção, órfãos e lembrete do backup (E-03 §5). Dados inventados (D-091).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  BACKUP_V1_COLUMNS,
  BACKUP_V2_COLUMNS,
  type BackupInput,
  type BackupRow,
  backupFileName,
  backupReminder,
  findOrphans,
  migrateBackup,
  parseBackup,
  planMerge,
  planTableMerge,
  serializeBackup,
  snoozeUntil,
} from "./backup.ts";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 25, 7, 14, 2); // 25/10/2026 07:14:02 UTC
const MOBILIS = { name: "mobilis", version: "2026-09-01" };
const deps = { sha256, installedDatasets: [MOBILIS] };

/** Uma linha com todas as colunas do contrato (`null` no que não for dado). */
function row(table: keyof typeof BACKUP_V1_COLUMNS, values: BackupRow): BackupRow {
  return Object.fromEntries(BACKUP_V1_COLUMNS[table].map((c) => [c, values[c] ?? null]));
}
const obs = (id: string, updated: number, extra: BackupRow = {}) =>
  row("observation", { id, created_at: updated, updated_at: updated, source: "user", stop_id: "stop-a", line_id: "line-1", observed_at: updated, kind: "boarded", mode: "live", recorded_at: updated, ...extra });

function input(over: Partial<BackupInput> = {}): BackupInput {
  return {
    schemaVersion: 1,
    appVersion: "0.3.0",
    exportedAt: T,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    datasets: [MOBILIS],
    tables: {
      observation: [obs("0002", T - 2000, { note: "chovia" }), obs("0001", T - 3000)],
      place: [row("place", { id: "p1", created_at: 1, updated_at: 1, source: "user", name: "Casa", is_shortcut: 1 })],
    },
    officialEdits: {},
    ...over,
  };
}

describe("arquivo: serialização legível e determinística (§5.2)", () => {
  it("cabeçalho do plano, linhas por id, chaves em ordem fixa; mesma entrada → mesmo texto", async () => {
    const text = await serializeBackup(input(), sha256);
    const again = await serializeBackup({ ...input(), tables: { ...input().tables, observation: [...input().tables.observation!].reverse() } }, sha256);
    expect(again).toBe(text);
    const file = JSON.parse(text);
    expect(Object.keys(file)).toEqual(["format", "formatVersion", "schemaVersion", "appVersion", "exportedAt", "network", "datasets", "counts", "checksum", "tables"]);
    expect(file.format).toBe("notebus-backup");
    expect(file.formatVersion).toBe(2);
    expect(file.exportedAt).toBe("2026-10-25T07:14:02Z");
    expect(file.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(file.tables.observation.map((o: BackupRow) => o.id)).toEqual(["0001", "0002"]);
    expect(Object.keys(file.tables.observation[0])).toEqual(BACKUP_V1_COLUMNS.observation);
    expect(file.counts.observation).toBe(2);
    expect(file.counts.place).toBe(1);
    expect(file.counts.official_edits).toBe(0);
    // Indentação de 2 espaços, uma linha por campo: dá para ler num editor de texto (A7).
    expect(text).toContain('\n        "note": "chovia",\n');
    // Outra hora de exportação: só `exportedAt` e `checksum` mudam.
    const later = await serializeBackup(input({ exportedAt: T + 60_000 }), sha256);
    const diff = text.split("\n").filter((line, i) => line !== later.split("\n")[i]);
    expect(diff.map((l) => l.trim().split(":")[0])).toEqual(['"exportedAt"', '"checksum"']);
  });

  it("coluna fora do contrato é recusada ao exportar (o formato não muda sem subir a versão)", async () => {
    await expect(serializeBackup(input({ tables: { place: [{ ...row("place", { id: "x", updated_at: 1 }), nova: 1 }] } }), sha256)).rejects.toThrow(/fora do formato/);
  });

  it("nome do arquivo: notebus-backup-2026-10-25-0814.json", () => {
    expect(backupFileName({ date: "2026-10-25", minute: 8 * 60 + 14 })).toBe("notebus-backup-2026-10-25-0814.json");
    expect(backupFileName({ date: "2027-01-02", minute: 5 })).toBe("notebus-backup-2027-01-02-0005.json");
  });
});

describe("checksum: qualquer byte alterado falha (T-24)", () => {
  it("o arquivo íntegro passa", async () => {
    const r = await parseBackup(await serializeBackup(input(), sha256), deps);
    expect(r.ok).toBe(true);
  });

  it("um dígito de observed_at, um espaço, o último caractere, o próprio checksum: checksum_mismatch", async () => {
    const text = await serializeBackup(input(), sha256);
    const at = text.indexOf('"observed_at": ') + '"observed_at": '.length;
    const digit = text[at + 3]!;
    const changes = [
      text.slice(0, at + 3) + (digit === "9" ? "8" : String(Number(digit) + 1)) + text.slice(at + 4), // um dígito
      text.replace('"note": "chovia"', '"note":  "chovia"'), // um espaço a mais
      text.replace('\n  "tables"', '\n   "tables"'), // indentação
      text.slice(0, -1), // o último caractere (a quebra de linha final)
      text.slice(0, -1) + " ", // trocado por espaço
    ];
    const checksum = JSON.parse(text).checksum as string;
    const last = checksum.at(-1) === "0" ? "1" : "0";
    changes.push(text.replace(checksum, checksum.slice(0, -1) + last)); // o checksum
    for (const changed of changes) {
      expect(changed).not.toBe(text);
      const r = await parseBackup(changed, deps);
      expect(r).toMatchObject({ ok: false, problem: "checksum_mismatch" });
    }
  });

  it("truncado: not_json; uma letra do format: not_backup", async () => {
    const text = await serializeBackup(input(), sha256);
    expect(await parseBackup(text.slice(0, text.length / 2), deps)).toMatchObject({ ok: false, problem: "not_json" });
    expect(await parseBackup(text.replace('"notebus-backup"', '"notebus-backuq"'), deps)).toMatchObject({ ok: false, problem: "not_backup" });
    expect(await parseBackup("{}", deps)).toMatchObject({ ok: false, problem: "not_backup" });
  });
});

/** Reescreve o arquivo com o checksum certo (para testar as verificações que vêm depois dele). */
async function resign(file: Record<string, unknown>): Promise<string> {
  const zero = `sha256:${"0".repeat(64)}`;
  const text = `${JSON.stringify({ ...file, checksum: zero }, null, 2)}\n`;
  return text.replace(zero, `sha256:${sha256(text)}`);
}

describe("versão, contagens e MOBILIS (§5.4, D-090)", () => {
  it("formatVersion 99 → format_newer; 0 inventada → format_unknown; a 1 passa direto", async () => {
    const file = JSON.parse(await serializeBackup(input(), sha256));
    expect(await parseBackup(await resign({ ...file, formatVersion: 99 }), deps)).toMatchObject({ ok: false, problem: "format_newer" });
    expect(await parseBackup(await resign({ ...file, formatVersion: 0 }), deps)).toMatchObject({ ok: false, problem: "format_unknown" });
    expect(await parseBackup(await resign({ ...file, formatVersion: 1.5 }), deps)).toMatchObject({ ok: false, problem: "format_unknown" });
    expect(migrateBackup({ ...file, formatVersion: 0 })).toMatchObject({ ok: false, problem: "format_unknown" });
    const v1 = migrateBackup(file);
    expect(v1.ok && v1.backup).toBe(file);
  });

  it("contagem que não bate → counts_mismatch; MOBILIS ausente → dataset_missing com qual falta", async () => {
    const file = JSON.parse(await serializeBackup(input(), sha256));
    const wrong = { ...file, counts: { ...file.counts, observation: 3 } };
    expect(await parseBackup(await resign(wrong), deps)).toMatchObject({ ok: false, problem: "counts_mismatch" });
    const r = await parseBackup(await resign(file), { sha256, installedDatasets: [{ name: "mobilis", version: "2027-01-01" }] });
    expect(r).toMatchObject({ ok: false, problem: "dataset_missing", missing: [MOBILIS] });
  });

  it("coluna a mais numa linha (arquivo editado e reassinado) → format_unknown", async () => {
    const file = JSON.parse(await serializeBackup(input(), sha256));
    file.tables.place[0].extra = 1;
    expect(await parseBackup(await resign(file), deps)).toMatchObject({ ok: false, problem: "format_unknown" });
  });
});

describe("junção (D-089)", () => {
  it("só no arquivo → entra; nos dois → vale o updated_at mais novo; empate → fica o do app", () => {
    const app = [obs("b", 200), obs("c", 300), obs("e", 500)];
    const file = [obs("a", 100), obs("b", 250, { note: "editado" }), obs("c", 300, { note: "empate" }), obs("e", 400, { note: "velho" })];
    const { ops, summary } = planTableMerge("observation", app, file);
    expect(summary).toEqual({ inserted: 1, replaced: 1, kept: 2 });
    expect(ops.map((o) => [o.kind, o.kind === "insert" ? o.row.id : o.after.id])).toEqual([["insert", "a"], ["replace", "b"]]);
  });

  it("apagado segue a mesma regra e nunca apaga: o mais novo vale, apagado ou não", () => {
    const deletedInFile = planTableMerge("observation", [obs("x", 100)], [obs("x", 200, { deleted_at: 200 })]);
    expect(deletedInFile.ops).toMatchObject([{ kind: "replace", after: { deleted_at: 200 } }]);
    const restoredInApp = planTableMerge("observation", [obs("x", 300)], [obs("x", 200, { deleted_at: 200 })]);
    expect(restoredInApp.ops).toEqual([]);
    // Nenhuma operação de apagar existe: só insert e replace.
    expect(new Set([...deletedInFile.ops, ...restoredInApp.ops].map((o) => o.kind))).toEqual(new Set(["replace"]));
  });

  it("T-25 no domínio: backup de domingo (A, B) num app com segunda e terça (C, D) e B editada depois", () => {
    const sunday = Date.UTC(2026, 9, 4, 8);
    const A = obs("A", sunday), B = obs("B", sunday + 60_000);
    const C = obs("C", sunday + DAY), D = obs("D", sunday + 2 * DAY);
    const Bedited = obs("B", sunday + 2 * DAY + 1, { note: "editada na terça" });
    const { ops, summary } = planTableMerge("observation", [Bedited, C, D], [A, B]);
    // A entra; B fica a do app (mais nova); C e D nem são tocadas.
    expect(summary).toEqual({ inserted: 1, replaced: 0, kept: 1 });
    expect(ops).toEqual([{ kind: "insert", table: "observation", row: A }]);
  });

  it("match_status manual entra como está", () => {
    const manual = obs("m", 500, { match_status: "manual", trip_id: "trip-x" });
    expect(planTableMerge("observation", [], [manual]).ops).toEqual([{ kind: "insert", table: "observation", row: manual }]);
  });

  it("setting junta pela key (o app novo tem a sua própria linha, com outro id); walk_time pelo par ponto ↔ lugar", () => {
    const mine = row("setting", { id: "novo", updated_at: 10, source: "user", key: "margin_minutes", value: "2" });
    const theirs = row("setting", { id: "velho", updated_at: 20, source: "user", key: "margin_minutes", value: "3" });
    expect(planTableMerge("setting", [mine], [theirs]).ops).toEqual([{ kind: "replace", table: "setting", before: mine, after: theirs }]);
    const w1 = row("walk_time", { id: "w1", updated_at: 5, stop_id: "s", place_id: "p", minutes_min: 4 });
    const w2 = row("walk_time", { id: "w2", updated_at: 4, stop_id: "s", place_id: "p", minutes_min: 9 });
    expect(planTableMerge("walk_time", [w1], [w2]).summary).toEqual({ inserted: 0, replaced: 0, kept: 1 });
  });

  it("dado oficial editado ganha do oficial intacto mesmo mais velho (a MOBILIS reimportada é sempre mais nova)", () => {
    const official = row("stop", { id: "s1", updated_at: 900, source: "official", official_key: "k", name: "Arrabalde" });
    const edited = row("stop", { id: "s1", updated_at: 100, source: "official_edited", official_key: "k", name: "Arrabalde", note: "lado do rio" });
    expect(planTableMerge("stop", [official], [edited]).summary.replaced).toBe(1);
    // Editado nos dois: volta a valer o updated_at.
    expect(planTableMerge("stop", [{ ...edited, updated_at: 900 }], [edited]).summary.kept).toBe(1);
  });

  it("planMerge: soma por tabela e no total, olhando também official_edits", async () => {
    const file = JSON.parse(await serializeBackup(input({ officialEdits: { stop: [row("stop", { id: "s1", updated_at: 1, source: "official_edited", name: "X" })] } }), sha256));
    const plan = planMerge((t) => (t === "observation" ? [obs("0001", T)] : []), file.tables);
    expect(plan.byTable.observation).toEqual({ inserted: 1, replaced: 0, kept: 1 });
    expect(plan.byTable.stop).toEqual({ inserted: 1, replaced: 0, kept: 0 });
    expect(plan.total).toEqual({ inserted: 3, replaced: 0, kept: 1 });
  });
});

describe("órfãos (D-122)", () => {
  it("lista quem aponta para ponto, linha ou viagem que não existe; o resto não", async () => {
    const file = JSON.parse(await serializeBackup(input({
      tables: {
        observation: [obs("o1", 1, { ride_id: "r1" }), obs("o2", 2, { stop_id: "sumiu", trip_id: "trip-velha" })],
        ride: [row("ride", { id: "r1", updated_at: 1, boarding_observation_id: "o1", status: "open" })],
      },
    }), sha256));
    const known = (t: string, id: string) => (t === "stop" && id === "stop-a") || (t === "line" && id === "line-1");
    expect(findOrphans(file.tables, known)).toEqual([
      { table: "observation", id: "o2", column: "stop_id", missing: "sumiu" },
      { table: "observation", id: "o2", column: "trip_id", missing: "trip-velha" },
    ]);
  });
});

describe("lembrete (D-088)", () => {
  const now = T;
  const base = { now, recordsUpdatedSinceExport: true, hasRecords: true, snoozedUntil: null };
  it("7 dias exatos não mostra; 8 mostra (\"há 8 dias\"); 7 dias e 1 ms já mostra", () => {
    expect(backupReminder({ ...base, lastExportAt: now - 7 * DAY })).toEqual({ show: false, daysSince: 7 });
    expect(backupReminder({ ...base, lastExportAt: now - 8 * DAY })).toEqual({ show: true, daysSince: 8 });
    expect(backupReminder({ ...base, lastExportAt: now - 7 * DAY - 1 }).show).toBe(true);
  });
  it("sem registro novo desde o export não mostra, nem com 30 dias", () => {
    expect(backupReminder({ ...base, recordsUpdatedSinceExport: false, lastExportAt: now - 30 * DAY }).show).toBe(false);
  });
  it("nunca exportou: mostra se já há registros; sem registros, não", () => {
    expect(backupReminder({ ...base, lastExportAt: null })).toEqual({ show: true, daysSince: null });
    expect(backupReminder({ ...base, lastExportAt: null, hasRecords: false }).show).toBe(false);
  });
  it("\"Agora não\" esconde por 2 dias e depois volta", () => {
    const snoozedUntil = snoozeUntil(now);
    expect(snoozedUntil).toBe(now + 2 * DAY);
    const r = (at: number) => backupReminder({ ...base, now: at, lastExportAt: now - 9 * DAY, snoozedUntil }).show;
    expect([r(now), r(now + 2 * DAY - 1), r(now + 2 * DAY)]).toEqual([false, false, true]);
  });
  it("\"Agora não\" gravado há 1 dia (snoozedUntil = now + 1 dia) esconde o lembrete", () => {
    expect(backupReminder({ ...base, lastExportAt: now - 9 * DAY, snoozedUntil: now + 1 * DAY }).show).toBe(false);
  });
  it("snoozedUntil = now + 2 dias exatos esconde (limite incluso)", () => {
    expect(backupReminder({ ...base, lastExportAt: now - 9 * DAY, snoozedUntil: now + 2 * DAY }).show).toBe(false);
  });
  it("snoozedUntil = now + 20 dias (relógio voltou) mostra o lembrete", () => {
    expect(
      backupReminder({
        ...base,
        recordsUpdatedSinceExport: true,
        lastExportAt: now - 8 * DAY,
        snoozedUntil: now + 20 * DAY,
      }).show,
    ).toBe(true);
  });
  it("snoozedUntil no passado mostra o lembrete", () => {
    expect(backupReminder({ ...base, lastExportAt: now - 9 * DAY, snoozedUntil: now - 1 }).show).toBe(true);
  });
});

describe("contrato", () => {
  it("todas as tabelas do arquivo têm as colunas comuns primeiro", () => {
    for (const t of BACKUP_TABLES) expect(BACKUP_V2_COLUMNS[t].slice(0, 5)).toEqual(["id", "created_at", "updated_at", "deleted_at", "source"]);
  });
});
