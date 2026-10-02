/**
 * Importador da MOBILIS (E-01 §5, bloco 4a): grava o arquivo `mobilis-<vigência>.json` já lido no banco do app.
 * Sem tela e sem expo-sqlite aqui: o celular e os testes no Node usam este mesmo código com adaptadores
 * diferentes (`ImportDb`), como em `migrate.ts`. SQL à mão, de propósito: o plano tem 30 tabelas e aqui
 * só se grava em 12; os testes conferem as colunas contra o esquema real.
 *
 * - Valida a forma antes de tocar no banco (`parseSeedFile`); arquivo inválido não grava nada.
 * - Uma transação: falhou no meio, nada fica gravado.
 * - Repetível (D-123): os IDs vêm das chaves (UUIDv5). `INSERT OR IGNORE` não duplica nem altera o que já existe.
 *   Vigência nova traz IDs novos e acrescenta; paragens e linhas (chave sem vigência) são reaproveitadas.
 * - Nunca apaga (soft delete, D-122): dado oficial que sumiu do arquivo novo fica como está.
 */
import { officialId, parseSeedFile, sha1Hex, uuidv7, type DayTypeCode, type SeedFile } from "@notebus/domain";

type SqlValue = string | number | null;

/** O mínimo que a importação precisa do banco aberto. */
export interface ImportDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]> | Record<string, unknown>[];
}

export interface ImportProgress {
  table: string;
  /** Quantas tabelas já terminaram, de `of`. */
  step: number;
  of: number;
  rows: number;
}

export interface ImportReport {
  /** Por tabela: `total` no arquivo, `inserted` gravadas agora (o resto já existia). */
  tables: Record<string, { total: number; inserted: number }>;
  datasetId: string;
  /** `false` se este mesmo arquivo (mesmo `checksum`) já tinha sido importado. */
  newDataset: boolean;
}

export interface ImportOptions {
  onProgress?: (p: ImportProgress) => void;
  now?: () => number;
}

/** Tipos de dia (E-01 §4.4): nome e ordem nas telas. */
const DAY_TYPES: Record<DayTypeCode, { name: string; sort: number }> = {
  weekday: { name: "Dia útil", sort: 1 },
  saturday: { name: "Sábado", sort: 2 },
  sunday_holiday: { name: "Domingo e feriado", sort: 3 },
};

export async function importMobilis(db: ImportDb, json: unknown, options: ImportOptions = {}): Promise<ImportReport> {
  const seed = parseSeedFile(json); // falha aqui = banco intocado
  const now = (options.now ?? Date.now)();
  const tables: ImportReport["tables"] = {};
  const steps = 12;
  let step = 0;

  /** Grava as linhas que ainda não existem (pelo `id`, ou pelo `official_key`). Devolve quantas entraram. */
  async function insert(table: string, columns: string[], rows: SqlValue[][]) {
    const sql = `INSERT OR IGNORE INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    let inserted = 0;
    for (const row of rows) inserted += (await db.run(sql, row)).changes;
    tables[table] = { total: rows.length, inserted };
    options.onProgress?.({ table, step: ++step, of: steps, rows: rows.length });
  }
  /** Colunas comuns (§4.2) de um dado oficial. */
  const common = (id: string, key: string): SqlValue[] => [id, now, now, "official", key];
  const COMMON = ["id", "created_at", "updated_at", "source", "official_key"];

  const networkId = officialId("mobilis/network");
  const days = [...new Set(seed.trips.flatMap((t) => t.dayTypes))];
  const dayTypeIds = new Map(days.map((code) => [code, officialId(`mobilis/day_type/${code}`)]));
  const seasonKey = (s: { startMd: string; endMd: string; mode: string }) => `mobilis/season/${s.startMd}-${s.endMd}-${s.mode}`;
  const seasons = new Map(seed.trips.flatMap((t) => (t.season ? [[seasonKey(t.season), t.season] as const] : [])));

  await db.exec("BEGIN IMMEDIATE");
  try {
    await insert("network", [...COMMON, "name", "timezone"], [
      [...common(networkId, "mobilis/network"), seed.network.name, seed.network.timezone],
    ]);
    await insert("day_type", [...COMMON, "network_id", "code", "name", "sort"],
      days.map((code) => [...common(dayTypeIds.get(code)!, `mobilis/day_type/${code}`), networkId, code, DAY_TYPES[code].name, DAY_TYPES[code].sort]));
    await insert("season", [...COMMON, "network_id", "name", "start_md", "end_md", "mode"],
      [...seasons].map(([key, s]) => [...common(officialId(key), key), networkId, `${s.startMd} a ${s.endMd} (${s.mode})`, s.startMd, s.endMd, s.mode]));

    const datasetId = await importDataset(db, seed, networkId, now, tables);
    options.onProgress?.({ table: "dataset", step: ++step, of: steps, rows: 1 });

    await insert("line", [...COMMON, "network_id", "code", "name", "color"],
      seed.lines.map((l) => [...common(l.id, l.key), networkId, l.code, l.name, l.color]));
    await insert("stop", [...COMMON, "network_id", "name", "aliases", "external_id"],
      seed.stops.map((s) => [...common(s.id, s.key), networkId, s.name, JSON.stringify(s.aliases), s.externalId]));
    await insert("pattern", [...COMMON, "line_id", "label", "is_circular"],
      seed.patterns.map((p) => [...common(p.id, p.key), p.lineId, p.label, p.isCircular ? 1 : 0]));
    await insert("pattern_stop", [...COMMON, "pattern_id", "position", "stop_id", "is_timepoint", "timepoint_label"],
      seed.patternStops.map((p) => [...common(p.id, p.key), p.patternId, p.position, p.stopId, p.isTimepoint ? 1 : 0, p.timepointLabel]));
    await insert("timetable", [...COMMON, "pattern_id", "dataset_id", "valid_from", "valid_to"],
      seed.timetables.map((t) => [...common(t.id, t.key), t.patternId, datasetId, t.validFrom, null]));
    await closePreviousTimetables(db, seed);

    await insert("trip", [...COMMON, "timetable_id", "first_position", "last_position", "season_id"],
      seed.trips.map((t) => [...common(t.id, t.key), t.timetableId, t.firstPosition, t.lastPosition, t.season ? officialId(seasonKey(t.season)) : null]));
    await insert("trip_day_type", [...COMMON, "trip_id", "day_type_id"],
      seed.trips.flatMap((t) =>
        t.dayTypes.map((code) => {
          const key = `${t.key}/day/${code}`;
          return [...common(officialId(key), key), t.id, dayTypeIds.get(code)!];
        })));
    await insert("stop_time", [...COMMON, "trip_id", "pattern_stop_id", "service_minute", "origin"],
      seed.stopTimes.map((s) => [...common(s.id, s.key), s.tripId, s.patternStopId, s.serviceMinute, "official"]));

    await db.exec("COMMIT");
    return { tables, datasetId, newDataset: tables.dataset!.inserted === 1 };
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    throw error;
  }
}

/** "2026-09-01" → "2026-08-31". */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Q-49 / D-124: quadro novo fecha o anterior do mesmo percurso. O percurso é o mesmo quando a chave termina igual
 * (`…/pattern/L1`: só a vigência no meio muda). Só mexe em `valid_to` e só onde ele está vazio e a vigência é mais
 * antiga que a nova: quadro já fechado, ou mais novo que o importado, não é tocado.
 */
async function closePreviousTimetables(db: ImportDb, seed: SeedFile) {
  const patternCode = new Map(seed.patterns.map((p) => [p.id, p.code]));
  for (const t of seed.timetables) {
    const suffix = `/pattern/${patternCode.get(t.patternId)}`;
    await db.run(
      `UPDATE timetable SET valid_to = ? WHERE valid_to IS NULL AND valid_from < ? AND id <> ?
         AND pattern_id IN (SELECT id FROM pattern WHERE substr(official_key, -length(?)) = ?)`,
      [dayBefore(t.validFrom), t.validFrom, t.id, suffix, suffix],
    );
  }
}

/** `dataset` é fato da importação (UUIDv7): uma linha por arquivo. O mesmo arquivo (mesmo checksum) reaproveita a linha. */
async function importDataset(db: ImportDb, seed: SeedFile, networkId: string, now: number, tables: ImportReport["tables"]) {
  const checksum = sha1Hex(JSON.stringify(seed));
  const found = await db.all(
    "SELECT id FROM dataset WHERE network_id = ? AND name = ? AND version = ? AND checksum = ? LIMIT 1",
    [networkId, seed.dataset.name, seed.dataset.version, checksum],
  );
  if (found[0]) {
    tables.dataset = { total: 1, inserted: 0 };
    return found[0].id as string;
  }
  const id = uuidv7(now);
  await db.run(
    "INSERT INTO dataset (id, created_at, updated_at, source, network_id, name, version, imported_at, checksum) VALUES (?, ?, ?, 'official', ?, ?, ?, ?, ?)",
    [id, now, now, networkId, seed.dataset.name, seed.dataset.version, now, checksum],
  );
  tables.dataset = { total: 1, inserted: 1 };
  return id;
}
