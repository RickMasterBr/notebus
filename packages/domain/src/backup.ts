/**
 * Backup (E-03 §5, D-082, D-088, D-089, D-090): o formato do arquivo, a validação, a junção, os órfãos e o lembrete.
 * Puro: sem banco, sem `expo-*`, sem React. O SHA-256 entra por parâmetro (`expo-crypto` no app, `node:crypto` nos testes).
 *
 * **O formato é contrato (D-090).** O que está neste arquivo (tabelas, colunas e a ordem delas) é a `formatVersion` 2;
 * `BACKUP_V1_COLUMNS` é o contrato congelado da 1 e nunca muda (a 2 só acrescenta `departure_alarm`, D-104).
 * Mudou uma coluna ou uma tabela? Sobe `BACKUP_FORMAT_VERSION`, acrescenta a conversão em `UPGRADES` e guarda um
 * arquivo de exemplo novo em `fixtures/backup/`. O app sempre lê todas as versões anteriores.
 *
 * **Checksum (T-24).** `checksum` = `"sha256:"` + 64 hex do texto **inteiro** do arquivo, com o valor do próprio
 * checksum trocado por 64 zeros (`"sha256:000…0"`, o mesmo tamanho). Exemplo: o exportador escreve o arquivo com os
 * zeros, calcula o SHA-256 desse texto e troca os zeros pelo resultado. Quem lê faz o caminho inverso. Assim qualquer
 * byte alterado (um dígito, um espaço, uma quebra de linha, o próprio checksum) muda o resultado e o arquivo é recusado.
 */

export const BACKUP_FORMAT = "notebus-backup";
export const BACKUP_FORMAT_VERSION = 2;

/** Valor de uma coluna como o SQLite guarda (JSON e booleanos já vêm como texto e 0/1). */
export type BackupValue = string | number | null;
export type BackupRow = Record<string, BackupValue>;

const COMMON = ["id", "created_at", "updated_at", "deleted_at", "source"];
const OFFICIAL = [...COMMON, "official_key"];

/**
 * Tabelas e colunas da `formatVersion` 1, na ordem em que aparecem no arquivo. **Contrato congelado: não muda nunca**
 * (o `format-v1.json` é a prova de que o app lê o formato 1). `dataset` não vai: é fato da importação da MOBILIS, não seu.
 */
export const BACKUP_V1_COLUMNS = {
  // Realidade e intenção (§4.5, §4.6): tudo é seu (`source = user`).
  observation: [
    ...COMMON, "stop_id", "line_id", "observed_at", "observed_end_at", "kind", "mode", "ride_id", "note", "recorded_at",
    "gps_lat", "gps_lon", "gps_accuracy_m",
    "service_date", "service_minute", "pattern_stop_id", "trip_id", "match_status", "deviation_min", "match_rule_version",
    "review_dismissed_at",
  ],
  ride: [...COMMON, "boarding_observation_id", "alighting_observation_id", "trip_id", "status"],
  place: [...COMMON, "name", "icon", "lat", "lon", "is_shortcut", "shortcut_order"],
  walk_time: [...COMMON, "stop_id", "place_id", "minutes_min", "minutes_max", "origin"],
  route: [...COMMON, "origin_place_id", "destination_place_id"],
  option: [...COMMON, "route_id", "kind", "board_pattern_stop_id", "alight_pattern_stop_id", "walk_minutes", "sort"],
  setting: [...COMMON, "key", "value"],
  // Rede e programação (§4.3, §4.4): aqui só o que você criou (`source = user`); o que você editou num dado oficial
  // vai em `official_edits`. Os dados oficiais intactos não vão (vêm da importação da MOBILIS, D-086).
  holiday: [...OFFICIAL, "network_id", "date", "name", "scope"],
  date_override: [...OFFICIAL, "network_id", "date", "day_type_id", "note"],
  network: [...OFFICIAL, "name", "timezone"],
  stop: [...OFFICIAL, "network_id", "name", "aliases", "external_id", "lat", "lon", "note"],
  line: [...OFFICIAL, "network_id", "code", "name", "color"],
  pattern: [...OFFICIAL, "line_id", "label", "is_circular"],
  pattern_stop: [...OFFICIAL, "pattern_id", "position", "stop_id", "is_timepoint", "timepoint_label"],
  day_type: [...OFFICIAL, "network_id", "code", "name", "sort"],
  season: [...OFFICIAL, "network_id", "name", "start_md", "end_md", "mode"],
  timetable: [...OFFICIAL, "pattern_id", "dataset_id", "valid_from", "valid_to"],
  trip: [...OFFICIAL, "timetable_id", "first_position", "last_position", "season_id", "frequency_id"],
  trip_day_type: [...OFFICIAL, "trip_id", "day_type_id"],
  stop_time: [...OFFICIAL, "trip_id", "pattern_stop_id", "service_minute", "origin"],
  frequency: [...OFFICIAL, "pattern_id", "ref_pattern_stop_id", "from_minute", "to_minute", "headway_minutes"],
  frequency_day_type: [...OFFICIAL, "frequency_id", "day_type_id"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Tabelas e colunas da `formatVersion` 2 (a atual): as da 1 mais `departure_alarm` (E-06, D-104). Iguais ao esquema (um
 * teste do app confere coluna por coluna). `alarm_event` não vai: o histórico dos avisos é do aparelho.
 */
export const BACKUP_V2_COLUMNS = {
  ...BACKUP_V1_COLUMNS,
  departure_alarm: [
    ...COMMON, "option_id", "anchor_trip_id", "anchor_base_minute", "weekdays", "once_date", "valid_from", "valid_to", "enabled",
  ],
} as const satisfies Record<string, readonly string[]>;

export type BackupTableName = keyof typeof BACKUP_V2_COLUMNS;
export const BACKUP_TABLES = Object.keys(BACKUP_V2_COLUMNS) as BackupTableName[];

/** Tabelas que podem ter dados oficiais editados por você (`source = official_edited`). */
export const OFFICIAL_EDIT_TABLES = BACKUP_TABLES.filter((t) => BACKUP_V2_COLUMNS[t].includes("official_key" as never));

/**
 * Chaves do `setting` que vão no backup: só as **suas preferências**. Estado do aparelho ou da sessão não vai nem volta
 * (`first_run_done`, `last_export_at`, o adiamento do lembrete; a versão do esquema é o `PRAGMA user_version` e o
 * relógio de teste só existe na memória).
 */
export const BACKUP_SETTING_KEYS: readonly string[] = ["margin_minutes", "recent_stops"];

export type BackupTables = Record<BackupTableName, BackupRow[]> & {
  official_edits: Partial<Record<BackupTableName, BackupRow[]>>;
};

export interface BackupHeader {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  /** ISO UTC, sem milissegundos: "2026-10-25T08:14:02Z". */
  exportedAt: string;
  network: { name: string; timezone: string } | null;
  datasets: { name: string; version: string }[];
  counts: Record<string, number>;
  checksum: string;
}

export interface BackupFile extends BackupHeader {
  tables: BackupTables;
}

export type Sha256 = (text: string) => string | Promise<string>;

const CHECKSUM_PREFIX = "sha256:";
const ZERO_CHECKSUM = `${CHECKSUM_PREFIX}${"0".repeat(64)}`;

// ─── Montar e escrever ───────────────────────────────────────────────────────

export interface BackupInput {
  schemaVersion: number;
  appVersion: string;
  /** Epoch ms do instante da exportação. */
  exportedAt: number;
  network: { name: string; timezone: string } | null;
  datasets: readonly { name: string; version: string }[];
  /** Linhas por tabela, como o banco as devolve (qualquer ordem de chave e de linha). */
  tables: Partial<Record<BackupTableName, readonly BackupRow[]>>;
  officialEdits: Partial<Record<BackupTableName, readonly BackupRow[]>>;
}

/** Linha com as colunas do contrato, nesta ordem. Coluna que faltar vira `null`; coluna a mais é recusada. */
function orderRow(table: BackupTableName, row: BackupRow): BackupRow {
  const columns = BACKUP_V2_COLUMNS[table] as readonly string[];
  const extra = Object.keys(row).filter((k) => !columns.includes(k));
  if (extra.length > 0) throw new Error(`backup: coluna fora do formato ${BACKUP_FORMAT_VERSION} em ${table}: ${extra.join(", ")}`);
  const out: BackupRow = {};
  for (const c of columns) out[c] = row[c] ?? null;
  return out;
}

/** Ordem estável: pelo `id` (UUIDv7 já é ordem de tempo). Comparação por código, sem depender do idioma do aparelho. */
const byId = (a: BackupRow, b: BackupRow) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const sortedRows = (table: BackupTableName, rows: readonly BackupRow[] = []) => rows.map((r) => orderRow(table, r)).sort(byId);

/** "2026-10-25T08:14:02Z". */
export function isoSeconds(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Contagens do cabeçalho: uma por tabela de `tables`, mais o total de `official_edits`. */
export function countTables(tables: BackupTables): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) counts[t] = tables[t].length;
  counts.official_edits = OFFICIAL_EDIT_TABLES.reduce((s, t) => s + (tables.official_edits[t]?.length ?? 0), 0);
  return counts;
}

/**
 * O arquivo, pronto para gravar: JSON com 2 espaços de indentação, chaves em ordem fixa, linhas por `id`.
 * Mesma entrada → mesmo texto, exceto `exportedAt` (e, por consequência, o `checksum`).
 */
export async function serializeBackup(input: BackupInput, sha256: Sha256): Promise<string> {
  const tables = {} as BackupTables;
  for (const t of BACKUP_TABLES) tables[t] = sortedRows(t, input.tables[t]);
  tables.official_edits = {};
  for (const t of OFFICIAL_EDIT_TABLES) tables.official_edits[t] = sortedRows(t, input.officialEdits[t]);
  const datasets = [...input.datasets]
    .map((d) => ({ name: d.name, version: d.version }))
    .sort((a, b) => (a.name + "\u0000" + a.version < b.name + "\u0000" + b.version ? -1 : 1));
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    appVersion: input.appVersion,
    exportedAt: isoSeconds(input.exportedAt),
    network: input.network ? { name: input.network.name, timezone: input.network.timezone } : null,
    datasets,
    counts: countTables(tables),
    checksum: ZERO_CHECKSUM,
    tables,
  };
  const zeroed = `${JSON.stringify(file, null, 2)}\n`;
  const digest = await sha256(zeroed);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("backup: sha256 não devolveu 64 hex minúsculos");
  // O placeholder aparece primeiro no cabeçalho (antes de `tables`): é ele que se troca.
  return zeroed.replace(`"checksum": "${ZERO_CHECKSUM}"`, `"checksum": "${CHECKSUM_PREFIX}${digest}"`);
}

/** Nome do arquivo: `notebus-backup-2026-10-25-0814.json`, na hora de Lisboa já convertida por quem chama. */
export function backupFileName(local: { date: string; minute: number }): string {
  const hh = String(Math.floor(local.minute / 60)).padStart(2, "0");
  const mm = String(local.minute % 60).padStart(2, "0");
  return `notebus-backup-${local.date}-${hh}${mm}.json`;
}

// ─── Ler e validar ───────────────────────────────────────────────────────────

/** Códigos estáveis das recusas (o app traduz cada um num texto). */
export type BackupProblem =
  | "not_json"
  | "not_backup"
  | "checksum_mismatch"
  | "format_newer"
  | "format_unknown"
  | "counts_mismatch"
  | "dataset_missing";

export type BackupParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; problem: BackupProblem; detail: string; missing?: { name: string; version: string }[] };

export interface ParseDeps {
  sha256: Sha256;
  /** As MOBILIS instaladas no app agora. */
  installedDatasets: readonly { name: string; version: string }[];
}

const fail = (problem: BackupProblem, detail: string): BackupParseResult => ({ ok: false, problem, detail });
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Confere o checksum do texto como está (regra no topo do arquivo). */
export async function checksumMatches(text: string, claimed: string, sha256: Sha256): Promise<boolean> {
  if (!/^sha256:[0-9a-f]{64}$/.test(claimed)) return false;
  const needle = `"checksum": "${claimed}"`;
  const at = text.indexOf(needle);
  if (at === -1) return false;
  const zeroed = text.slice(0, at) + `"checksum": "${ZERO_CHECKSUM}"` + text.slice(at + needle.length);
  return `${CHECKSUM_PREFIX}${await sha256(zeroed)}` === claimed;
}

/**
 * Lê e valida, **sem gravar nada e sem lançar** para erro esperado. Ordem: JSON → formato → checksum → versão (com
 * conversão das mais velhas) → forma e contagens → MOBILIS instalada. Só um resultado `ok` pode ir para o banco.
 */
export async function parseBackup(text: string, deps: ParseDeps): Promise<BackupParseResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("not_json", "o arquivo não é um JSON completo");
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) return fail("not_backup", "o arquivo não é um backup do NoteBus");
  if (typeof raw.checksum !== "string" || !(await checksumMatches(text, raw.checksum, deps.sha256))) {
    return fail("checksum_mismatch", "o arquivo foi alterado ou está corrompido");
  }
  const migrated = migrateBackup(raw);
  if (!migrated.ok) return migrated;
  const backup = migrated.backup;

  const shape = shapeProblem(backup);
  if (shape) return fail("format_unknown", shape);
  const expected = countTables(backup.tables);
  for (const [key, n] of Object.entries(expected)) {
    if (backup.counts[key] !== n) return fail("counts_mismatch", `${key}: o cabeçalho diz ${backup.counts[key]}, o arquivo tem ${n}`);
  }
  if (Object.keys(backup.counts).length !== Object.keys(expected).length) return fail("counts_mismatch", "contagens a mais no cabeçalho");

  const installed = new Set(deps.installedDatasets.map((d) => `${d.name}\u0000${d.version}`));
  const missing = backup.datasets.filter((d) => !installed.has(`${d.name}\u0000${d.version}`));
  if (missing.length > 0) {
    return { ok: false, problem: "dataset_missing", detail: missing.map((d) => `${d.name} ${d.version}`).join(", "), missing };
  }
  return { ok: true, backup };
}

/**
 * Conversões de versões antigas até a atual: `from` → função que devolve a versão seguinte. A 1 → 2 acrescenta a tabela
 * `departure_alarm` vazia (o formato 1 não tinha avisos, D-104). Não mexe no objeto lido: devolve cópias.
 */
const UPGRADES: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {
  1: (file) => ({
    ...file,
    formatVersion: 2,
    counts: { ...(isObject(file.counts) ? file.counts : {}), departure_alarm: 0 },
    tables: { ...(isObject(file.tables) ? file.tables : {}), departure_alarm: [] },
  }),
};

/**
 * Leva um backup de qualquer versão conhecida até a atual. Versão mais nova que a do app → `format_newer` ("atualize o
 * app"); número que nunca existiu (0, negativo, fracionário) → `format_unknown`. A atual passa direto; as antigas sobem.
 */
export function migrateBackup(raw: Record<string, unknown>): BackupParseResult {
  const version = raw.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return fail("format_unknown", `formatVersion ${JSON.stringify(version)} não existe`);
  }
  if (version > BACKUP_FORMAT_VERSION) {
    return fail("format_newer", `formatVersion ${version}; este app lê até a ${BACKUP_FORMAT_VERSION}`);
  }
  let file = raw;
  for (let v = version; v < BACKUP_FORMAT_VERSION; v++) {
    const up = UPGRADES[v];
    if (!up) return fail("format_unknown", `sem conversão da formatVersion ${v}`);
    file = up(file);
  }
  return { ok: true, backup: file as unknown as BackupFile };
}

/** A forma do arquivo já convertido: cabeçalho, todas as tabelas, colunas do contrato, `id` em toda linha. */
function shapeProblem(b: BackupFile): string | null {
  if (typeof b.schemaVersion !== "number" || typeof b.appVersion !== "string" || typeof b.exportedAt !== "string") return "cabeçalho incompleto";
  if (!Array.isArray(b.datasets) || b.datasets.some((d) => !isObject(d) || typeof d.name !== "string" || typeof d.version !== "string")) return "datasets inválido";
  if (!isObject(b.counts) || !isObject(b.tables) || !isObject(b.tables.official_edits)) return "tabelas ausentes";
  const checkRows = (table: BackupTableName, rows: unknown): string | null => {
    if (!Array.isArray(rows)) return `${table}: não é lista`;
    const columns = BACKUP_V2_COLUMNS[table] as readonly string[];
    for (const row of rows) {
      if (!isObject(row) || typeof row.id !== "string" || typeof row.updated_at !== "number") return `${table}: linha sem id ou updated_at`;
      const keys = Object.keys(row);
      if (keys.length !== columns.length || keys.some((k, i) => k !== columns[i])) return `${table}: colunas fora do formato`;
      if (Object.values(row).some((v) => v !== null && typeof v !== "string" && typeof v !== "number")) return `${table}: valor inválido`;
    }
    return null;
  };
  for (const t of BACKUP_TABLES) {
    const p = checkRows(t, b.tables[t]);
    if (p) return p;
  }
  for (const t of OFFICIAL_EDIT_TABLES) {
    const p = checkRows(t, b.tables.official_edits[t] ?? []);
    if (p) return p;
  }
  return null;
}

/** O que a prévia mostra: "Backup de 25/10/2026, 412 registros, 3 lugares. MOBILIS 2026-09-01". */
export function backupSummary(b: BackupFile): { exportedAt: string; records: number; places: number; datasets: string[] } {
  return {
    exportedAt: b.exportedAt,
    records: b.tables.observation.length,
    places: b.tables.place.length,
    datasets: b.datasets.map((d) => d.version),
  };
}

// ─── Juntar (D-089) ──────────────────────────────────────────────────────────

export type MergeOp =
  | { kind: "insert"; table: BackupTableName; row: BackupRow }
  /** `before` é a linha do app (para o Desfazer); `after` a do arquivo, que passa a valer. */
  | { kind: "replace"; table: BackupTableName; before: BackupRow; after: BackupRow };

export interface MergeSummary {
  inserted: number;
  replaced: number;
  /** Estavam nos dois e ficou a do app (a do app é mais nova ou empatou). */
  kept: number;
}

export interface MergePlan {
  ops: MergeOp[];
  total: MergeSummary;
  byTable: Partial<Record<BackupTableName, MergeSummary>>;
}

/**
 * Qual linha do app é "a mesma" de uma linha do arquivo. Quase sempre o `id`. Duas tabelas têm uma chave única além
 * do `id` e por isso juntam por ela: `setting` (a `key`: o app novo cria a sua própria linha de `margin_minutes`, com
 * outro `id`) e `walk_time` (um por par ponto ↔ lugar, D-069).
 */
export function matchKey(table: BackupTableName, row: BackupRow): string {
  if (table === "setting") return `key:${row.key}`;
  if (table === "walk_time") return `pair:${row.stop_id}\u0000${row.place_id}`;
  return `id:${row.id}`;
}

/**
 * A junção de uma tabela (D-089), pura. Linha só no arquivo → `insert`. Só no app → fica (nem entra na conta).
 * Nos dois → vale a de `updated_at` mais novo; **empate: fica a do app**. Apagada (`deleted_at`) segue a mesma regra:
 * nada é apagado de verdade, só vale a versão mais nova da linha. `match_status = manual` entra como está.
 *
 * `existing` = as linhas do app que podem casar com as do arquivo (qualquer `source`). Um dado oficial que você
 * editou (`official_edited`) sempre ganha de um oficial intacto (`official`), mesmo com `updated_at` mais velho:
 * depois de reinstalar, a MOBILIS reimportada é mais nova que a sua edição e a apagaria (proposta, ver relatório).
 */
export function planTableMerge(table: BackupTableName, existing: readonly BackupRow[], incoming: readonly BackupRow[]): { ops: MergeOp[]; summary: MergeSummary } {
  const app = new Map(existing.map((r) => [matchKey(table, r), r] as const));
  const ops: MergeOp[] = [];
  const summary: MergeSummary = { inserted: 0, replaced: 0, kept: 0 };
  for (const row of incoming) {
    const mine = app.get(matchKey(table, row));
    if (!mine) {
      ops.push({ kind: "insert", table, row });
      summary.inserted++;
      continue;
    }
    const editBeatsOfficial = row.source === "official_edited" && mine.source === "official";
    if (editBeatsOfficial || Number(row.updated_at) > Number(mine.updated_at)) {
      ops.push({ kind: "replace", table, before: mine, after: row });
      summary.replaced++;
    } else {
      summary.kept++;
    }
  }
  return { ops, summary };
}

/** A junção do arquivo inteiro. `existing(table)` dá as linhas do app daquela tabela que podem casar. */
export function planMerge(
  existing: (table: BackupTableName) => readonly BackupRow[],
  tables: BackupTables,
): MergePlan {
  const plan: MergePlan = { ops: [], total: { inserted: 0, replaced: 0, kept: 0 }, byTable: {} };
  for (const t of BACKUP_TABLES) {
    const incoming = [...tables[t], ...(tables.official_edits[t] ?? [])];
    if (incoming.length === 0) continue;
    const { ops, summary } = planTableMerge(t, existing(t), incoming);
    plan.ops.push(...ops);
    plan.byTable[t] = summary;
    plan.total.inserted += summary.inserted;
    plan.total.replaced += summary.replaced;
    plan.total.kept += summary.kept;
  }
  return plan;
}

// ─── Órfãos (D-122) ──────────────────────────────────────────────────────────

export interface Orphan {
  table: BackupTableName;
  id: string;
  column: string;
  /** O `id` que não existe. */
  missing: string;
}

/** Referências que a conferência olha: tabela.coluna → tabela de destino. */
const REFERENCES: [BackupTableName, string, BackupTableName][] = [
  ["observation", "stop_id", "stop"],
  ["observation", "line_id", "line"],
  ["observation", "pattern_stop_id", "pattern_stop"],
  ["observation", "trip_id", "trip"],
  ["observation", "ride_id", "ride"],
  ["ride", "boarding_observation_id", "observation"],
  ["ride", "alighting_observation_id", "observation"],
  ["ride", "trip_id", "trip"],
  ["walk_time", "stop_id", "stop"],
  ["walk_time", "place_id", "place"],
  ["route", "origin_place_id", "place"],
  ["route", "destination_place_id", "place"],
  ["option", "route_id", "route"],
  ["option", "board_pattern_stop_id", "pattern_stop"],
  ["option", "alight_pattern_stop_id", "pattern_stop"],
];

/**
 * Registros do arquivo que apontam para algo que não existe nem no app nem no próprio arquivo (ex.: um ponto que a
 * MOBILIS mudou). Eles **entram assim mesmo** (D-122: sem chave estrangeira, o fato nunca se perde); a lista só é
 * mostrada. `known(table)` diz se um `id` existe no app.
 */
export function findOrphans(tables: BackupTables, known: (table: BackupTableName, id: string) => boolean): Orphan[] {
  const inFile = new Map<BackupTableName, Set<string>>();
  for (const t of BACKUP_TABLES) {
    inFile.set(t, new Set([...tables[t], ...(tables.official_edits[t] ?? [])].map((r) => String(r.id))));
  }
  const out: Orphan[] = [];
  for (const [table, column, target] of REFERENCES) {
    for (const row of tables[table]) {
      const ref = row[column];
      if (ref === null || ref === undefined) continue;
      const id = String(ref);
      if (inFile.get(target)!.has(id) || known(target, id)) continue;
      out.push({ table, id: String(row.id), column, missing: id });
    }
  }
  return out;
}

// ─── Lembrete (D-088) ────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** Mais de 7 dias sem exportar (D-088). */
export const BACKUP_REMINDER_DAYS = 7;
/** "Agora não" esconde por 2 dias (D-088). */
export const BACKUP_SNOOZE_DAYS = 2;

export interface ReminderInput {
  now: number;
  /** Epoch ms do último export, ou `null` se nunca exportou. */
  lastExportAt: number | null;
  /** Há registro novo ou alterado depois do último export. */
  recordsUpdatedSinceExport: boolean;
  hasRecords: boolean;
  /** Até quando o "Agora não" esconde, ou `null`. */
  snoozedUntil: number | null;
}

/**
 * Mostra o lembrete se (há registro novo desde o último export **e** passaram mais de 7 dias) **ou** (nunca exportou
 * e já há registros), e o "Agora não" já venceu. 7 dias exatos não mostram; 7 dias e 1 ms mostram.
 * O "Agora não" só vale se estiver a no máximo 2 dias à frente de agora (datas mais distantes são tratadas como vencidas caso o relógio tenha voltado).
 * `daysSince` = dias inteiros desde o último export (para "há 9 dias"), `null` se nunca.
 */
export function backupReminder(input: ReminderInput): { show: boolean; daysSince: number | null } {
  const { now, lastExportAt, snoozedUntil } = input;
  const daysSince = lastExportAt === null ? null : Math.floor((now - lastExportAt) / DAY_MS);
  const due = lastExportAt === null
    ? input.hasRecords
    : input.recordsUpdatedSinceExport && now - lastExportAt > BACKUP_REMINDER_DAYS * DAY_MS;
  const snoozed =
    snoozedUntil !== null && now < snoozedUntil && snoozedUntil - now <= BACKUP_SNOOZE_DAYS * DAY_MS;
  return { show: due && !snoozed, daysSince };
}

/** O instante até quando o "Agora não" esconde o lembrete. */
export function snoozeUntil(now: number): number {
  return now + BACKUP_SNOOZE_DAYS * DAY_MS;
}
