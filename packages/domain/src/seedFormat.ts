/** Definição de tipos e schema para o formato JSON do seed de dados da MOBILIS. */
/**
 * O arquivo de importação da MOBILIS (`mobilis-<vigência>.json`, E-01 §5.1): formato, validação de forma
 * e as conferências que o D-122 (sem chave estrangeira) torna obrigatórias.
 *
 * Quem gera (`tools/mobilis-seed`) e quem lê (importador do app) usam este arquivo, para não haver dois formatos.
 * Dados da MOBILIS não ficam aqui (D-091): só o formato.
 */
import { officialId } from "./ids.ts";

/** Códigos de tipo de dia (E-01 §4.4). */
export type DayTypeCode = "weekday" | "saturday" | "sunday_holiday";

/** Como a tabela agrupa os dias; entra na chave da viagem. */
export type DaysCode = "util" | "sab" | "dom-fer" | "sab-dom-fer";

/** "Oferta não se realiza em Julho e Agosto" → época que exclui as viagens nesses meses. */
export interface SeasonRef {
  startMd: string;
  endMd: string;
  mode: "exclude";
}

/**
 * Cada entidade oficial leva `key` (o texto fixo da D-086, aprovado no CONFERIR.md parte 4)
 * e `id` = UUIDv5 da chave. Rede, tipos de dia e épocas vão por código, sem chave (Q-48, D-123).
 */
export interface SeedFile {
  format: "notebus.mobilis-seed";
  formatVersion: 1;
  network: { name: string; timezone: string };
  dataset: { name: string; version: string };
  stops: { id: string; key: string; name: string; aliases: string[]; externalId: string | null }[];
  lines: { id: string; key: string; code: string; name: string; color: string }[];
  patterns: { id: string; key: string; code: string; lineId: string; label: string; isCircular: boolean }[];
  patternStops: {
    id: string;
    key: string;
    patternId: string;
    position: number;
    stopId: string;
    isTimepoint: boolean;
    timepointLabel: string | null;
  }[];
  timetables: { id: string; key: string; patternId: string; validFrom: string; validTo: null }[];
  trips: {
    id: string;
    key: string;
    timetableId: string;
    firstPosition: number;
    lastPosition: number;
    dayTypes: DayTypeCode[];
    season: SeasonRef | null;
    /** Quadro de origem no markdown, contado pela ordem (1…), não pelo título. */
    sourceTable: number;
  }[];
  stopTimes: { id: string; key: string; tripId: string; patternStopId: string; serviceMinute: number }[];
  /**
   * Feriados gravados na tabela `holiday` (E-02 §3.1): o municipal de Leiria, uma linha por ano (a coluna `recurring`
   * só chega na E-08). Os nacionais não vêm aqui: vêm da biblioteca. Opcional para o arquivo da E-01, que não tinha.
   */
  holidays?: SeedHoliday[];
}

/** Um feriado do arquivo; chave `mobilis/holiday/<AAAA-MM-DD>` (D-086), `id` = UUIDv5 dela. */
export interface SeedHoliday {
  id: string;
  key: string;
  date: string;
  name: string;
  scope: "national" | "municipal";
}

/**
 * Erro lançado quando o arquivo Seed lido falha na validação de formato.
 */
export class SeedFormatError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`arquivo de importação inválido: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "…" : ""}`);
    this.name = "SeedFormatError";
    this.problems = problems;
  }
}

// "s" texto, "i" inteiro, "b" booleano, "s?" texto ou nulo, "s[]" lista de textos.
type Field = "s" | "i" | "b" | "s?" | "s[]";
const SHAPE: Record<string, Record<string, Field>> = {
  stops: { id: "s", key: "s", name: "s", aliases: "s[]", externalId: "s?" },
  lines: { id: "s", key: "s", code: "s", name: "s", color: "s" },
  patterns: { id: "s", key: "s", code: "s", lineId: "s", label: "s", isCircular: "b" },
  patternStops: { id: "s", key: "s", patternId: "s", position: "i", stopId: "s", isTimepoint: "b", timepointLabel: "s?" },
  timetables: { id: "s", key: "s", patternId: "s", validFrom: "s" },
  trips: { id: "s", key: "s", timetableId: "s", firstPosition: "i", lastPosition: "i", sourceTable: "i" },
  stopTimes: { id: "s", key: "s", tripId: "s", patternStopId: "s", serviceMinute: "i" },
  holidays: { id: "s", key: "s", date: "s", name: "s", scope: "s" },
};
/** Listas que o arquivo pode não ter (arquivos de antes da E-02). */
const OPTIONAL_LISTS = new Set(["holidays"]);
const DAY_TYPES = ["weekday", "saturday", "sunday_holiday"];
const MD = /^\d\d-\d\d$/;
const DATE = /^\d{4}-\d\d-\d\d$/;

/** Utilitário interno: checa se é objeto não-nulo e não-array. */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validador de tipos básicos esperado no schema. */
function fieldOk(v: unknown, f: Field): boolean {
  switch (f) {
    case "s": return typeof v === "string" && v.length > 0;
    case "i": return Number.isInteger(v);
    case "b": return typeof v === "boolean";
    case "s?": return v === null || (typeof v === "string" && v.length > 0);
    case "s[]": return Array.isArray(v) && v.every((x) => typeof x === "string");
  }
}

/**
 * Confere a **forma** do JSON (tipos de cada campo) e as referências e IDs; devolve o arquivo tipado.
 * Falha com `SeedFormatError` listando os problemas se houver violação estrutural ou lógica.
 * Não toca em banco nenhum.
 *
 * @param value - Objeto parseado do JSON a validar
 * @returns O arquivo validado e tipado como `SeedFile`
 */
export function parseSeedFile(value: unknown): SeedFile {
  const problems: string[] = [];
  if (!isObj(value)) throw new SeedFormatError(["o arquivo não é um objeto JSON"]);
  if (value.format !== "notebus.mobilis-seed") problems.push("format deve ser notebus.mobilis-seed");
  if (value.formatVersion !== 1) problems.push("formatVersion deve ser 1");
  for (const [key, shape] of [["network", { name: "s", timezone: "s" }], ["dataset", { name: "s", version: "s" }]] as const) {
    const o = value[key];
    if (!isObj(o)) problems.push(`${key}: ausente`);
    else for (const [f, t] of Object.entries(shape)) if (!fieldOk(o[f], t as Field)) problems.push(`${key}.${f}: inválido`);
  }
  for (const [list, shape] of Object.entries(SHAPE)) {
    const rows = value[list];
    if (rows === undefined && OPTIONAL_LISTS.has(list)) continue;
    if (!Array.isArray(rows)) {
      problems.push(`${list}: deve ser uma lista`);
      continue;
    }
    rows.forEach((row, i) => {
      if (!isObj(row)) return problems.push(`${list}[${i}]: não é objeto`);
      for (const [f, t] of Object.entries(shape)) if (!fieldOk(row[f], t)) problems.push(`${list}[${i}].${f}: inválido`);
      if (list === "timetables" && (row.validTo !== null || !DATE.test(String(row.validFrom)))) {
        problems.push(`timetables[${i}]: validFrom AAAA-MM-DD e validTo nulo`);
      }
      if (list === "trips") {
        const days = row.dayTypes;
        if (!Array.isArray(days) || days.length === 0 || !days.every((d) => DAY_TYPES.includes(d as string))) {
          problems.push(`trips[${i}].dayTypes: inválido`);
        }
        const s = row.season;
        if (s !== null && !(isObj(s) && MD.test(String(s.startMd)) && MD.test(String(s.endMd)) && s.mode === "exclude")) {
          problems.push(`trips[${i}].season: inválida`);
        }
      }
    });
  }
  if (problems.length === 0) {
    const seed = value as unknown as SeedFile;
    problems.push(...checkReferences(seed), ...checkIds(seed), ...checkHolidays(seed.holidays ?? []));
  }
  if (problems.length > 0) throw new SeedFormatError(problems);
  return value as unknown as SeedFile;
}

/**
 * Verifica se todas as referências (chaves estrangeiras simuladas)
 * apontam para entidades presentes no próprio arquivo.
 * (D-122: como o SQLite importado não possui FK constraints ativas para otimização,
 * isto é obrigatório a nível de aplicação).
 */
export function checkReferences(seed: SeedFile): string[] {
  const errors: string[] = [];
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const stops = ids(seed.stops);
  const lines = ids(seed.lines);
  const patterns = ids(seed.patterns);
  const patternStops = ids(seed.patternStops);
  const timetables = ids(seed.timetables);
  const trips = ids(seed.trips);
  const ref = (ok: boolean, what: string) => {
    if (!ok) errors.push(`referência solta: ${what}`);
  };
  for (const p of seed.patterns) ref(lines.has(p.lineId), `percurso ${p.key} → linha ${p.lineId}`);
  for (const ps of seed.patternStops) {
    ref(patterns.has(ps.patternId), `paragem de percurso ${ps.key} → percurso ${ps.patternId}`);
    ref(stops.has(ps.stopId), `paragem de percurso ${ps.key} → paragem ${ps.stopId}`);
  }
  for (const t of seed.timetables) ref(patterns.has(t.patternId), `quadro ${t.key} → percurso ${t.patternId}`);
  for (const t of seed.trips) ref(timetables.has(t.timetableId), `viagem ${t.key} → quadro ${t.timetableId}`);
  for (const st of seed.stopTimes) {
    ref(trips.has(st.tripId), `horário ${st.key} → viagem ${st.tripId}`);
    ref(patternStops.has(st.patternStopId), `horário ${st.key} → paragem de percurso ${st.patternStopId}`);
  }
  return errors;
}

/**
 * V8: Garante que cada ID oficial seja de fato o UUIDv5 determinístico da sua chave (D-086).
 * Isso assegura que re-importar os mesmos dados gera sempre os mesmos IDs.
 */
export function checkIds(seed: SeedFile): string[] {
  const all = [seed.stops, seed.lines, seed.patterns, seed.patternStops, seed.timetables, seed.trips, seed.stopTimes, seed.holidays ?? []];
  return all.flat().flatMap((x) => (x.id === officialId(x.key) ? [] : [`V8: ID de ${x.key} não é o UUIDv5 da chave`]));
}

/** "2026-02-30" não passa: a data tem de existir no calendário. */
export function isRealDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Feriados (E-02 bloco 1): data que existe, escopo conhecido, sem data repetida e sem chave repetida. */
export function checkHolidays(holidays: SeedHoliday[]): string[] {
  const errors: string[] = [];
  const dates = new Set<string>();
  const keys = new Set<string>();
  for (const h of holidays) {
    if (!isRealDate(h.date)) errors.push(`feriado ${h.key}: data inválida ${h.date}`);
    if (h.scope !== "municipal" && h.scope !== "national") errors.push(`feriado ${h.key}: scope inválido ${h.scope}`);
    if (dates.has(h.date)) errors.push(`feriado repetido em ${h.date}`);
    if (keys.has(h.key)) errors.push(`feriado com chave repetida ${h.key}`);
    dates.add(h.date);
    keys.add(h.key);
  }
  return errors;
}
