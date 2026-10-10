/**
 * Backup no banco (E-03 §5.3 e §5.4): ler o que vai no arquivo, gravar a importação que junta (D-089) e o Desfazer.
 * Sem expo-* aqui: o celular e os testes no Node usam este mesmo código com adaptadores diferentes (`ImportDb`), como
 * `importMobilis.ts`. O formato, a validação e a junção são do domínio (`@notebus/domain`, `backup.ts`).
 *
 * Importar, nesta ordem: (1) o arquivo já passou por `parseBackup` inteiro (nada é gravado antes); (2) cópia do banco
 * (o mecanismo da migração, E-01 §6); (3) uma transação só com as operações do `planMerge`: só `INSERT` e `UPDATE`,
 * nunca `DELETE`; (4) os registros importados que não são `manual` voltam para a fila de deduções (o chamador roda a
 * fila depois, sem segurar o toast). O Desfazer é a transação inversa, com o que a importação guardou em memória.
 */
import {
  BACKUP_SETTING_KEYS,
  BACKUP_TABLES,
  BACKUP_V4_COLUMNS,
  type BackupFile,
  type BackupInput,
  type BackupRow,
  type BackupTableName,
  type MergeSummary,
  OFFICIAL_EDIT_TABLES,
  type Orphan,
  findOrphans,
  planMerge,
} from "@notebus/domain";
import type { ImportDb } from "./importMobilis";
import { type BackupStore, pruneBackups } from "./migrate";

/** Chaves do `setting` que são estado do aparelho (não vão no backup, D-088 e §5.3). */
export const LAST_EXPORT_AT = "last_export_at";
export const BACKUP_REMINDER_SNOOZED_UNTIL = "backup_reminder_snoozed_until";

const q = (name: string) => `\`${name}\``;
const columnsOf = (table: BackupTableName) => BACKUP_V4_COLUMNS[table] as readonly string[];
const selectColumns = (table: BackupTableName) => columnsOf(table).map(q).join(", ");

async function all(db: ImportDb, sql: string, params: (string | number | null)[] = []): Promise<Record<string, unknown>[]> {
  return await db.all(sql, params);
}

/** Linha do SQLite como o backup a guarda (só texto, número e nulo). */
function asRow(r: Record<string, unknown>): BackupRow {
  const out: BackupRow = {};
  for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : (v as string | number | null);
  return out;
}

// ─── Exportar ────────────────────────────────────────────────────────────────

/**
 * O que vai no arquivo, lido do banco (§5.2): de cada tabela, o que é seu (`source = user`, apagados incluídos); de
 * cada tabela de rede e programação, também o que você editou (`official_edited`); do `setting`, só as preferências
 * (`BACKUP_SETTING_KEYS`). Os dados oficiais intactos e o `dataset` não vão.
 */
export async function readBackupInput(db: ImportDb, opts: { now: number; appVersion: string }): Promise<BackupInput> {
  const tables: BackupInput["tables"] = {};
  const officialEdits: BackupInput["officialEdits"] = {};
  for (const t of BACKUP_TABLES) {
    const settingOnly = t === "setting" ? ` AND \`key\` IN (${BACKUP_SETTING_KEYS.map(() => "?").join(", ")})` : "";
    const params = t === "setting" ? [...BACKUP_SETTING_KEYS] : [];
    tables[t] = (await all(db, `SELECT ${selectColumns(t)} FROM ${q(t)} WHERE source = 'user'${settingOnly}`, params)).map(asRow);
  }
  for (const t of OFFICIAL_EDIT_TABLES) {
    officialEdits[t] = (await all(db, `SELECT ${selectColumns(t)} FROM ${q(t)} WHERE source = 'official_edited'`)).map(asRow);
  }
  const net = (await all(db, "SELECT name, timezone FROM network WHERE deleted_at IS NULL ORDER BY id LIMIT 1"))[0];
  return {
    schemaVersion: await schemaVersion(db),
    appVersion: opts.appVersion,
    exportedAt: opts.now,
    network: net ? { name: String(net.name), timezone: String(net.timezone) } : null,
    datasets: await installedDatasets(db),
    tables,
    officialEdits,
  };
}

export async function schemaVersion(db: ImportDb): Promise<number> {
  return Number((await all(db, "PRAGMA user_version"))[0]?.user_version ?? 0);
}

/** As MOBILIS instaladas (nome e vigência), sem repetir. */
export async function installedDatasets(db: ImportDb): Promise<{ name: string; version: string }[]> {
  const rows = await all(db, "SELECT DISTINCT name, version FROM dataset WHERE deleted_at IS NULL ORDER BY name, version");
  return rows.map((r) => ({ name: String(r.name), version: String(r.version) }));
}

// ─── Estado do aparelho no `setting` (não vai no backup) ─────────────────────

export async function readSettingNumber(db: ImportDb, key: string): Promise<number | null> {
  const row = (await all(db, "SELECT value FROM setting WHERE `key` = ? AND deleted_at IS NULL", [key]))[0];
  if (!row) return null;
  const value = JSON.parse(String(row.value)) as unknown;
  return typeof value === "number" ? value : null;
}

/** Grava (ou troca) uma chave do `setting`. `id` só é usado se a chave ainda não existe. */
export async function writeSettingNumber(db: ImportDb, key: string, value: number, now: number, newId: () => string): Promise<void> {
  await db.run(
    "INSERT INTO setting (id, created_at, updated_at, source, `key`, value) VALUES (?, ?, ?, 'user', ?, ?) " +
      "ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL",
    [newId(), now, now, key, JSON.stringify(value)],
  );
}

/** O que o lembrete precisa (D-088): último export, adiamento, se há registros e se há registro novo desde o export. */
export async function readReminderState(db: ImportDb): Promise<{
  lastExportAt: number | null;
  snoozedUntil: number | null;
  hasRecords: boolean;
  recordsUpdatedSinceExport: boolean;
}> {
  const lastExportAt = await readSettingNumber(db, LAST_EXPORT_AT);
  const snoozedUntil = await readSettingNumber(db, BACKUP_REMINDER_SNOOZED_UNTIL);
  const live = await all(db, "SELECT 1 AS x FROM observation WHERE deleted_at IS NULL LIMIT 1");
  const changed = await all(db, "SELECT 1 AS x FROM observation WHERE updated_at > ? LIMIT 1", [lastExportAt ?? -1]);
  return { lastExportAt, snoozedUntil, hasRecords: live.length > 0, recordsUpdatedSinceExport: changed.length > 0 };
}

// ─── Importar ────────────────────────────────────────────────────────────────

/** O que o Desfazer precisa: os `id` que entraram e a linha de antes de cada uma que foi substituída. */
export interface ImportUndo {
  inserted: { table: BackupTableName; id: string }[];
  replaced: { table: BackupTableName; id: string; before: BackupRow }[];
}

export interface ImportOutcome {
  summary: MergeSummary;
  byTable: Partial<Record<BackupTableName, MergeSummary>>;
  orphans: Orphan[];
  undo: ImportUndo;
  /** Nome da cópia do banco feita antes de gravar. */
  copyName: string;
  /** Registros que voltaram para a fila de deduções (não `manual`). */
  requeued: number;
}

const CHUNK = 400;

/** As linhas do app que podem casar com as do arquivo (pelo `id`; `setting` e `walk_time` também pela chave única). */
async function existingRows(db: ImportDb, table: BackupTableName, incoming: readonly BackupRow[]): Promise<BackupRow[]> {
  if (table === "setting" || table === "walk_time") {
    return (await all(db, `SELECT ${selectColumns(table)} FROM ${q(table)}`)).map(asRow);
  }
  const ids = [...new Set(incoming.map((r) => String(r.id)))];
  const out: BackupRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = await all(db, `SELECT ${selectColumns(table)} FROM ${q(table)} WHERE id IN (${part.map(() => "?").join(", ")})`, part);
    out.push(...rows.map(asRow));
  }
  return out;
}

/** Os `id` que existem no app, para a conferência de órfãos. Uma consulta por tabela de destino. */
async function knownIds(db: ImportDb, file: BackupFile): Promise<(table: BackupTableName, id: string) => boolean> {
  const wanted = new Map<BackupTableName, Set<string>>();
  // Basta perguntar pelos ids que o arquivo cita; a função do domínio diz quais colunas olhar.
  findOrphans(file.tables, (table, id) => {
    if (!wanted.has(table)) wanted.set(table, new Set());
    wanted.get(table)!.add(id);
    return true;
  });
  const found = new Map<BackupTableName, Set<string>>();
  for (const [table, ids] of wanted) {
    const list = [...ids];
    const set = new Set<string>();
    for (let i = 0; i < list.length; i += CHUNK) {
      const part = list.slice(i, i + CHUNK);
      for (const r of await all(db, `SELECT id FROM ${q(table)} WHERE id IN (${part.map(() => "?").join(", ")})`, part)) set.add(String(r.id));
    }
    found.set(table, set);
  }
  return (table, id) => found.get(table)?.has(id) ?? false;
}

/** Órfãos do arquivo contra o banco atual (para a prévia, antes de gravar). */
export async function orphansOf(db: ImportDb, file: BackupFile): Promise<Orphan[]> {
  return findOrphans(file.tables, await knownIds(db, file));
}

/** Quantos entram, substituem e ficam, sem gravar nada (para a prévia). */
export async function previewMerge(db: ImportDb, file: BackupFile): Promise<MergeSummary> {
  const existing = new Map<BackupTableName, BackupRow[]>();
  for (const t of BACKUP_TABLES) {
    const incoming = [...file.tables[t], ...(file.tables.official_edits[t] ?? [])];
    existing.set(t, incoming.length > 0 ? await existingRows(db, t, incoming) : []);
  }
  return planMerge((t) => existing.get(t) ?? [], file.tables).total;
}

async function insertRow(db: ImportDb, table: BackupTableName, row: BackupRow): Promise<void> {
  const cols = columnsOf(table);
  await db.run(`INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c] ?? null));
}

/** Troca todas as colunas da linha `id` pelas de `row` (o `id` também, no caso de `setting` e `walk_time`). */
async function overwriteRow(db: ImportDb, table: BackupTableName, id: string, row: BackupRow): Promise<void> {
  const cols = columnsOf(table);
  const { changes } = await db.run(
    `UPDATE ${q(table)} SET ${cols.map((c) => `${q(c)} = ?`).join(", ")} WHERE id = ?`,
    [...cols.map((c) => row[c] ?? null), id],
  );
  if (changes !== 1) throw new Error(`backup: ${table} ${id} não encontrado para substituir`);
}

/**
 * Grava um backup já validado (`parseBackup` ok). Cópia do banco antes; uma transação só; falhou no meio → nada fica
 * gravado e o erro sobe. Devolve o que o Desfazer precisa.
 */
export async function importBackup(
  db: ImportDb,
  file: BackupFile,
  opts: { backups: BackupStore; now: number },
): Promise<ImportOutcome> {
  const copyName = `notebus-backup-${new Date(opts.now).toISOString().replace(/[:.]/g, "-")}-import.db`;
  await opts.backups.create(copyName);
  await pruneBackups(opts.backups);
  const orphans = await orphansOf(db, file);

  await db.exec("BEGIN IMMEDIATE");
  try {
    const existing = new Map<BackupTableName, BackupRow[]>();
    for (const t of BACKUP_TABLES) {
      const incoming = [...file.tables[t], ...(file.tables.official_edits[t] ?? [])];
      if (incoming.length > 0) existing.set(t, await existingRows(db, t, incoming));
    }
    const plan = planMerge((t) => existing.get(t) ?? [], file.tables);
    const undo: ImportUndo = { inserted: [], replaced: [] };
    let requeued = 0;
    for (const op of plan.ops) {
      const row = op.kind === "insert" ? op.row : op.after;
      if (op.kind === "insert") {
        await insertRow(db, op.table, op.row);
        undo.inserted.push({ table: op.table, id: String(op.row.id) });
      } else {
        await overwriteRow(db, op.table, String(op.before.id), op.after);
        undo.replaced.push({ table: op.table, id: String(op.after.id), before: op.before });
      }
      // Dedução refeita depois (§5.4.6), menos a que você escolheu à mão (D-085).
      // Só os vivos: a fila não olha apagados, e um apagado guarda a dedução como estava.
      if (op.table === "observation" && row.match_status !== "manual" && row.deleted_at === null) {
        await db.run("UPDATE observation SET match_rule_version = NULL WHERE id = ?", [String(row.id)]);
        requeued++;
      }
    }
    await db.exec("COMMIT");
    return { summary: plan.total, byTable: plan.byTable, orphans, undo, copyName, requeued };
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    throw error;
  }
}

/**
 * Desfazer a importação: só o que ela mudou, numa transação. As linhas que entraram saem; as substituídas voltam ao
 * valor de antes (inclusive a dedução, que a fila tinha refeito). O arquivo do banco não é trocado com o app aberto.
 */
export async function undoImport(db: ImportDb, undo: ImportUndo): Promise<void> {
  await db.exec("BEGIN IMMEDIATE");
  try {
    for (const { table, id } of undo.inserted) await db.run(`DELETE FROM ${q(table)} WHERE id = ?`, [id]);
    for (const { table, id, before } of undo.replaced) await overwriteRow(db, table, id, before);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    throw error;
  }
}
