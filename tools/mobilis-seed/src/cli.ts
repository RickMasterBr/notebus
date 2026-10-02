/**
 * Gera `docs/dados/mobilis/mobilis-<vigência>.json` a partir dos dados do repositório privado
 * (D-091). Se qualquer conferência V1–V8 falhar, o arquivo não é gerado (E-01 §5.1).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeed, serialize, type Expected, type SeedInput } from "./build.ts";
import type { SeedFile } from "./types.ts";
import { checkIds, checkKnownNumbers, checkReferences } from "./validate.ts";

export const MISSING_DATA_MESSAGE =
  "Os dados da MOBILIS não estão neste repositório. Clone o repositório privado em docs/ " +
  "(docs/dados/mobilis/) e rode de novo.";

/** Contagens conferidas à mão no bloco 3a (30 quadros pela ordem, não 29). */
export const MOBILIS_EXPECTED: Expected = { lines: 9, patterns: 11, tables: 30, rows: 227, trips: 242 };

/** Cores das linhas, 4.3 §3 (D-036). */
export const MOBILIS_COLORS: Record<string, string> = {
  "1": "#7CB342",
  "2": "#D32F2F",
  "3": "#4FC3F7",
  "4": "#1E3A8A",
  "5": "#2E7D32",
  "6": "#C7017F",
  "7": "#F57C00",
  "8": "#FDD835",
  "9": "#1C1C1E",
};

export function main(repoRoot: string, log: (s: string) => void = console.log, err: (s: string) => void = console.error): number {
  const dataDir = join(repoRoot, "docs", "dados", "mobilis");
  const mdPath = join(repoRoot, "docs", "referencias", "mobilis", "horarios-linhas.md");
  if (!existsSync(dataDir) || !existsSync(mdPath)) {
    err(MISSING_DATA_MESSAGE);
    return 1;
  }
  const input: SeedInput = {
    markdown: readFileSync(mdPath, "utf8"),
    timepoints: JSON.parse(readFileSync(join(dataDir, "timepoints.json"), "utf8")),
    stopsMap: JSON.parse(readFileSync(join(dataDir, "stops-map.json"), "utf8")),
    network: { name: "MOBILIS Leiria", timezone: "Europe/Lisbon" },
    colors: MOBILIS_COLORS,
  };

  const { seed, errors, report } = buildSeed(input, MOBILIS_EXPECTED);
  const text = serialize(seed);
  errors.push(...checkKnownNumbers(seed), ...checkIds(seed), ...checkReferences(seed));
  errors.push(...independentCount(input.markdown, seed));
  if (serialize(buildSeed(input, MOBILIS_EXPECTED).seed) !== text) errors.push("V8: duas gerações deram arquivos diferentes");

  if (errors.length > 0) {
    err(`Validação falhou (${errors.length}); o arquivo não foi gerado:`);
    for (const e of errors) err(`  ${e}`);
    return 1;
  }
  const out = join(dataDir, `mobilis-${seed.dataset.version}.json`);
  writeFileSync(out, text);
  log(`V1–V8 ok. ${out}`);
  log(
    `${seed.lines.length} linhas, ${seed.patterns.length} percursos, ${report.tables} quadros, ${report.rows} linhas de tabela, ` +
      `${seed.trips.length} viagens, ${seed.stops.length} paragens, ${seed.patternStops.length} paragens de percurso, ` +
      `${seed.stopTimes.length} horários.`,
  );
  log(`Linhas de tabela sem mapear: ${report.unmappedRows.length} (${report.droppedTimes} horários fora do arquivo).`);
  for (const u of report.unmappedRows) log(`  quadro ${u.table} ${u.pattern} linha ${u.row} "${u.name}"`);
  return 0;
}

/**
 * V7: percursos e viagens por linha contados direto do texto, sem o leitor do markdown:
 * cada bloco `| … |` é um quadro, e as viagens são as células da 1ª linha de dados.
 */
export function independentCount(md: string, seed: SeedFile): string[] {
  const counted = new Map<string, { patterns: number; trips: number }>();
  let line = "";
  let inTable = false;
  let rowInTable = 0;
  for (const raw of md.split(/\r?\n/)) {
    const head = /^## LINHA (\d+)/.exec(raw);
    if (head) {
      line = head[1]!;
      counted.set(line, { patterns: 0, trips: 0 });
    }
    const c = counted.get(line);
    if (!c) continue;
    if (/^### (Sentido \d+|Itinerário Completo)/.test(raw)) c.patterns++;
    if (raw.startsWith("|")) {
      rowInTable = inTable ? rowInTable + 1 : 0;
      inTable = true;
      if (rowInTable === 2) c.trips += raw.split("|").length - 3;
    } else inTable = false;
  }
  const errors: string[] = [];
  for (const l of seed.lines) {
    const patterns = seed.patterns.filter((p) => p.lineId === l.id);
    const tts = new Set(seed.timetables.filter((t) => patterns.some((p) => p.id === t.patternId)).map((t) => t.id));
    const trips = seed.trips.filter((t) => tts.has(t.timetableId)).length;
    const c = counted.get(l.code);
    if (!c || c.patterns !== patterns.length || c.trips !== trips) {
      errors.push(`V7: linha ${l.code}: ${patterns.length} percursos e ${trips} viagens no arquivo, contados ${c?.patterns} e ${c?.trips}`);
    }
  }
  return errors;
}
