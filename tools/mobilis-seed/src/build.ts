/** Script de construção e validação dos dados JSON da MOBILIS a partir do Markdown. */
/**
 * Monta o arquivo de importação a partir do markdown e dos dois mapeamentos, conferindo V1–V5 e
 * V7 pelo caminho (E-01 §5.3). Função pura: mesma entrada, mesma saída, byte a byte (V8).
 *
 * Chaves (D-086, aprovadas no CONFERIR.md parte 4):
 * - ponto com ID do Google `mobilis/stop/<ID>`; sem ID `mobilis/stop/<percurso>/<pos>` (primeira aparição)
 * - linha `mobilis/line/<n>`
 * - o resto leva a vigência: `mobilis/<vig>/pattern/<percurso>[/pos/<n>]`, `…/timetable/<percurso>`,
 *   `…/trip/<percurso>/<dias>/<HHMM da 1ª paragem>-p<pos>[/pos/<n>]`
 */
import { officialId } from "@notebus/domain/src/ids.ts";
import { checkPatternPositions, checkTripTimes } from "@notebus/domain/src/invariants.ts";
import { cleanStopName, parseMarkdown, type MdPattern, type MdTable } from "./markdown.ts";
import { checkHolidays } from "@notebus/domain/src/seedFormat.ts";
import type { DayTypeCode, DaysCode, HolidaysFile, SeedFile, SeedHoliday, StopsMapFile, TimepointRow, TimepointsFile } from "./types.ts";

export interface SeedInput {
  markdown: string;
  timepoints: TimepointsFile;
  stopsMap: StopsMapFile;
  holidays: HolidaysFile;
  network: { name: string; timezone: string };
  /** Cores por número da linha (4.3 §3). */
  colors: Record<string, string>;
}

/** Contagens esperadas (V7). */
export interface Expected {
  lines: number;
  patterns: number;
  tables: number;
  rows: number;
  trips: number;
}

export interface SeedReport {
  tables: number;
  rows: number;
  unmappedRows: { table: number; pattern: string; row: number; name: string }[];
  droppedTimes: number;
}

export interface SeedResult {
  seed: SeedFile;
  errors: string[];
  report: SeedReport;
}

const DAY_TYPES: Record<DaysCode, DayTypeCode[]> = {
  util: ["weekday"],
  sab: ["saturday"],
  "dom-fer": ["sunday_holiday"],
  "sab-dom-fer": ["saturday", "sunday_holiday"],
};

/**
 * Ponto central da construção do arquivo importável. Processa o markdown extraindo
 * as tabelas, cruza os dados com `timepoints` e `stopsMap` e preenche o formato `SeedFile`.
 * Valida V1 a V5 (completude e limites) e V7 (contagens esperadas).
 *
 * @param input - O conteúdo em markdown, as configurações e os mapeamentos.
 * @param expected - Quantidades esperadas para a checagem V7 de sanidade.
 * @returns Objeto com o `seed` montado, uma lista de erros (se vazio, sucesso) e um `report` de log.
 */
export function buildSeed(input: SeedInput, expected?: Expected): SeedResult {
  const { lines: mdLines, errors } = parseMarkdown(input.markdown);
  const vig = input.timepoints.vigencia;
  const k = (s: string) => ({ id: officialId(s), key: s });
  const seed: SeedFile = {
    format: "notebus.mobilis-seed",
    formatVersion: 1,
    network: input.network,
    dataset: { name: "mobilis", version: vig },
    stops: [],
    lines: [],
    patterns: [],
    patternStops: [],
    timetables: [],
    trips: [],
    stopTimes: [],
  };
  const report: SeedReport = { tables: 0, rows: 0, unmappedRows: [], droppedTimes: 0 };

  const patterns = mdLines.flatMap((l) => l.patterns);
  const byCode = new Map(patterns.map((p) => [p.code, p]));

  // ---------- V5: stops-map.json → ponto físico de cada (percurso, posição)
  const mapped = new Map<string, StopsMapFile["pontos"][number]>();
  for (const ponto of input.stopsMap.pontos) {
    const label = ponto.external_id ?? ponto.nome;
    if (ponto.posicoes.length === 0) errors.push(`V5: ponto ${label} sem posição`);
    for (const { percurso, posicao } of ponto.posicoes) {
      const p = byCode.get(percurso);
      if (!p) errors.push(`V5: ponto ${label}: percurso ${percurso} não existe`);
      else if (!(posicao >= 1 && posicao <= p.stops.length)) {
        errors.push(`V5: ponto ${label}: ${percurso} pos. ${posicao} não existe no itinerário`);
      }
      const at = `${percurso}/${posicao}`;
      const other = mapped.get(at);
      if (other) errors.push(`V5: ${at} está em dois pontos (${other.external_id ?? other.nome} e ${label})`);
      mapped.set(at, ponto);
    }
  }

  // ---------- Linhas, percursos, paragens
  const stopIdOf = new Map<string, string>(); // "L1/27" → stop id
  const stopByMapEntry = new Map<StopsMapFile["pontos"][number], SeedFile["stops"][number]>();
  for (const l of mdLines) {
    const color = input.colors[l.number];
    if (!color) errors.push(`linha ${l.number} sem cor`);
    const line = { ...k(`mobilis/line/${l.number}`), code: l.number, name: l.name, color: color ?? "" };
    seed.lines.push(line);
    for (const p of l.patterns) {
      const pattern = { ...k(`mobilis/${vig}/pattern/${p.code}`), code: p.code, lineId: line.id, label: p.label, isCircular: p.isCircular };
      seed.patterns.push(pattern);
      seed.timetables.push({ ...k(`mobilis/${vig}/timetable/${p.code}`), patternId: pattern.id, validFrom: vig, validTo: null });
      const v3 = checkPatternPositions(p.stops.map((_, i) => i + 1));
      if (v3 || p.stops.length === 0) errors.push(`V3: ${p.code}: ${v3 ?? "sem paragens"}`);
      p.stops.forEach((rawName, i) => {
        const pos = i + 1;
        const name = cleanStopName(rawName);
        const entry = mapped.get(`${p.code}/${pos}`);
        let stop = entry && stopByMapEntry.get(entry);
        if (!stop) {
          const key = entry?.external_id ? `mobilis/stop/${entry.external_id}` : `mobilis/stop/${p.code}/${pos}`;
          stop = { ...k(key), name: entry?.nome ?? name, aliases: [], externalId: entry?.external_id ?? null };
          seed.stops.push(stop);
          if (entry) stopByMapEntry.set(entry, stop);
        }
        if (name !== stop.name && !stop.aliases.includes(name)) stop.aliases.push(name);
        stopIdOf.set(`${p.code}/${pos}`, stop.id);
      });
    }
  }
  for (const s of seed.stops) s.aliases.sort();

  // ---------- Quadros → viagens e horários
  const tpPatterns = Object.keys(input.timepoints.percursos);
  const mdOrder = patterns.map((p) => p.code);
  if (tpPatterns.join() !== mdOrder.join()) {
    errors.push(`V4: percursos do timepoints.json (${tpPatterns.join(", ")}) ≠ markdown (${mdOrder.join(", ")})`);
  }
  for (const p of patterns) {
    const tp = input.timepoints.percursos[p.code];
    if (!tp) continue;
    if (tp.n_posicoes !== p.stops.length) errors.push(`V4: ${p.code}: n_posicoes ${tp.n_posicoes} ≠ ${p.stops.length} no itinerário`);
    if (tp.tabelas.length !== p.tables.length) {
      errors.push(`V4: ${p.code}: ${tp.tabelas.length} tabelas no timepoints.json, ${p.tables.length} no markdown`);
    }
    // Pela ordem: a n-ésima tabela do markdown é a n-ésima do timepoints.json.
    p.tables.forEach((table, ti) => {
      const tpt = tp.tabelas[ti];
      if (tpt) buildTable(p, table, tpt.linhas, tpt.viagens, tpt.id);
    });
  }

  function buildTable(p: MdPattern, table: MdTable, rows: TimepointRow[], viagens: number, tpId: string): void {
    const where = `quadro ${table.index} (${tpId}, md linha ${table.mdLine})`;
    report.tables++;
    report.rows += table.rows.length;
    const nCols = table.rows[0]?.cells.length ?? 0;
    // V1: mesmo número de colunas em todas as linhas.
    for (const r of table.rows) {
      if (r.cells.length !== nCols) errors.push(`V1: ${where}: "${r.name}" tem ${r.cells.length} colunas, a 1ª tem ${nCols}`);
    }
    if (nCols !== viagens) errors.push(`V7: ${where}: ${nCols} viagens no markdown, ${viagens} no timepoints.json`);
    if (rows.length !== table.rows.length) {
      errors.push(`V4: ${where}: ${table.rows.length} linhas no markdown, ${rows.length} no timepoints.json`);
      return;
    }
    // V4: toda linha decidida (posição ou "sem_mapear"), nomes iguais, posições crescendo.
    const positions: (number | null)[] = [];
    let last = 0;
    table.rows.forEach((r, ri) => {
      const tr = rows[ri]!;
      if (tr.nome_tabela !== r.name || tr.linha_tabela !== ri + 1) {
        errors.push(`V4: ${where}: linha ${ri + 1} é "${r.name}" no markdown, "${tr.nome_tabela}" no timepoints.json`);
      }
      if (tr.status === "alta") {
        const itin = p.stops[tr.posicao - 1];
        if (itin === undefined) errors.push(`V4: ${where}: "${r.name}" → pos. ${tr.posicao} não existe`);
        else if (itin !== tr.nome_itinerario) {
          errors.push(`V4: ${where}: pos. ${tr.posicao} é "${itin}" no itinerário, "${tr.nome_itinerario}" no timepoints.json`);
        }
        if (tr.posicao <= last) errors.push(`V4: ${where}: "${r.name}" pos. ${tr.posicao} não vem depois da ${last}`);
        last = tr.posicao;
        positions.push(tr.posicao);
      } else if (tr.status === "sem_mapear") {
        if (!tr.nota) errors.push(`V4: ${where}: "${r.name}" sem_mapear sem nota`);
        report.unmappedRows.push({ table: table.index, pattern: p.code, row: ri + 1, name: r.name });
        positions.push(null);
      } else {
        errors.push(`V4: ${where}: "${r.name}" ainda em dúvida`);
        positions.push(null);
      }
    });

    const timetableId = officialId(`mobilis/${vig}/timetable/${p.code}`);
    let prevStart: number | null = null;
    for (let c = 0; c < nCols; c++) {
      // Minuto de serviço (D-016): passou da meia-noite → +1440.
      const times: { row: number; minute: number }[] = [];
      let offset = 0;
      let prev: number | null = null;
      table.rows.forEach((r, ri) => {
        const raw = r.cells[c];
        if (raw === null || raw === undefined) return;
        let m = raw + offset;
        if (prev === null && prevStart !== null && m < prevStart && prevStart - m >= 720) offset += 1440;
        if (prev !== null && m < prev && prev - m >= 720) offset += 1440;
        m = raw + offset;
        // V2: horários não retrocedem ao longo da viagem (tabela inteira, mapeada ou não).
        if (prev !== null && m < prev) errors.push(`V2: ${where}: viagem ${c + 1}, "${r.name}" volta no tempo`);
        prev = m;
        times.push({ row: ri, minute: m });
      });
      if (times.length === 0) {
        errors.push(`V1: ${where}: viagem ${c + 1} sem nenhum horário`);
        continue;
      }
      prevStart = times[0]!.minute;
      const kept = times.flatMap((t) => {
        const pos = positions[t.row];
        if (pos === null || pos === undefined) {
          report.droppedTimes++;
          return [];
        }
        return [{ position: pos, serviceMinute: t.minute }];
      });
      if (kept.length < 2) {
        errors.push(`V4: ${where}: viagem ${c + 1} com menos de 2 horários mapeados`);
        continue;
      }
      const v2 = checkTripTimes(kept);
      if (v2) errors.push(`V2: ${where}: viagem ${c + 1}: ${v2}`);
      const first = kept[0]!;
      const hhmm = String(Math.floor(first.serviceMinute / 60)).padStart(2, "0") + String(first.serviceMinute % 60).padStart(2, "0");
      const tripKey = `mobilis/${vig}/trip/${p.code}/${table.days}/${hhmm}-p${first.position}`;
      const trip = {
        ...k(tripKey),
        timetableId,
        firstPosition: first.position,
        lastPosition: kept[kept.length - 1]!.position,
        dayTypes: DAY_TYPES[table.days],
        season: table.season,
        sourceTable: table.index,
      };
      seed.trips.push(trip);
      for (const t of kept) {
        seed.stopTimes.push({
          ...k(`${tripKey}/pos/${t.position}`),
          tripId: trip.id,
          patternStopId: officialId(`mobilis/${vig}/pattern/${p.code}/pos/${t.position}`),
          serviceMinute: t.serviceMinute,
        });
      }
    }
  }

  // ---------- Paragens de percurso (depois dos quadros, para saber o que é ponto de controle)
  const labels = new Map<string, string>();
  for (const p of patterns) {
    const tp = input.timepoints.percursos[p.code];
    for (const t of tp?.tabelas ?? []) {
      for (const r of t.linhas) if (r.status === "alta") labels.set(`${p.code}/${r.posicao}`, r.nome_tabela);
    }
  }
  for (const p of patterns) {
    const patternId = officialId(`mobilis/${vig}/pattern/${p.code}`);
    p.stops.forEach((_, i) => {
      const pos = i + 1;
      const label = labels.get(`${p.code}/${pos}`) ?? null;
      seed.patternStops.push({
        ...k(`mobilis/${vig}/pattern/${p.code}/pos/${pos}`),
        patternId,
        position: pos,
        stopId: stopIdOf.get(`${p.code}/${pos}`)!,
        isTimepoint: label !== null,
        timepointLabel: label,
      });
    });
  }

  // ---------- Feriados (E-02 bloco 1): municipal de Leiria, pela ordem da data
  seed.holidays = buildHolidays(input.holidays, errors);

  // ---------- V7: contagens; chaves únicas
  if (expected) {
    const got: Expected = {
      lines: seed.lines.length,
      patterns: seed.patterns.length,
      tables: report.tables,
      rows: report.rows,
      trips: seed.trips.length,
    };
    for (const key of Object.keys(expected) as (keyof Expected)[]) {
      if (got[key] !== expected[key]) errors.push(`V7: ${key}: ${got[key]}, esperado ${expected[key]}`);
    }
  }
  for (const dup of duplicateKeys(seed)) errors.push(`V8: chave repetida ${dup}`);

  return { seed, errors, report };
}

/**
 * `holidays.json` → feriados do arquivo. Confere a fonte (`official`), a chave (`mobilis/holiday/<data>`, D-086) e,
 * pelo domínio, data que existe, escopo, sem data nem chave repetida.
 */
export function buildHolidays(file: HolidaysFile, errors: string[]): SeedHoliday[] {
  if (!file || !Array.isArray(file.holidays)) {
    errors.push("feriados: holidays.json sem a lista holidays");
    return [];
  }
  const out: SeedHoliday[] = [];
  for (const h of file.holidays) {
    if (h.source !== "official") errors.push(`feriado ${h.date}: source deve ser official`);
    if (h.official_key !== `mobilis/holiday/${h.date}`) errors.push(`feriado ${h.date}: official_key deve ser mobilis/holiday/${h.date}`);
    if (typeof h.name !== "string" || h.name.length === 0) errors.push(`feriado ${h.date}: sem nome`);
    out.push({ id: officialId(h.official_key), key: h.official_key, date: h.date, name: h.name, scope: h.scope });
  }
  errors.push(...checkHolidays(out));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Todas as chaves do arquivo, para conferir que não se repetem. */
export function duplicateKeys(seed: SeedFile): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  const all = [seed.stops, seed.lines, seed.patterns, seed.patternStops, seed.timetables, seed.trips, seed.stopTimes, seed.holidays ?? []];
  for (const list of all) {
    for (const { key } of list) {
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
  }
  return dups;
}

/** Serialização estável: o mesmo arquivo, byte a byte, para a mesma entrada. */
/**
 * Formata o objeto SeedFile como uma string JSON determinística.
 * Ao invés de usar `JSON.stringify` puro, serializa itens individualmente
 * em uma linha, para facilitar revisões e diffs da Seed gerada.
 */
export function serialize(seed: SeedFile): string {
  return JSON.stringify(seed, null, 1) + "\n";
}
