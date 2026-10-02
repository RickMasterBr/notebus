/**
 * Leitura do `horarios-linhas.md` (a transcrição das tabelas da MOBILIS).
 *
 * Formato esperado, por linha de ônibus:
 * - `## LINHA <n> (<nome>)`
 * - itinerário: `### Itinerário Completo…` (percurso único, código `L<n>`) ou
 *   `### Sentido <k>: <rótulo>` seguido de `#### Itinerário…` (código `L<n>-s<k>`), e a lista `1. Nome`.
 * - tabelas de horário: blocos de linhas `| … |` sob um título de dias (Dias Úteis, Sábado,
 *   Domingos, "Sábados, Domingos…"). Cada coluna é uma viagem; `—` = não passa.
 *
 * Os quadros são numerados pela ordem em que aparecem (1…); o título não identifica (dois quadros
 * da L1 têm o mesmo título).
 */
import type { DaysCode, SeasonRef } from "./types.ts";

export interface MdRow {
  name: string;
  /** Minuto do relógio (0–1439) de cada coluna; `null` = sem horário. */
  cells: (number | null)[];
  mdLine: number;
}

export interface MdTable {
  /** Ordem no arquivo, a partir de 1. */
  index: number;
  mdLine: number;
  days: DaysCode;
  season: SeasonRef | null;
  rows: MdRow[];
}

export interface MdPattern {
  code: string;
  label: string;
  isCircular: boolean;
  /** Nomes do itinerário; `stops[0]` é a posição 1. */
  stops: string[];
  tables: MdTable[];
}

export interface MdLine {
  number: string;
  name: string;
  patterns: MdPattern[];
}

export const JULY_AUGUST: SeasonRef = { startMd: "07-01", endMd: "08-31", mode: "exclude" };

export function parseMarkdown(md: string): { lines: MdLine[]; errors: string[] } {
  const lines: MdLine[] = [];
  const errors: string[] = [];
  const text = md.split(/\r?\n/);

  let line: MdLine | null = null;
  let pattern: MdPattern | null = null;
  let inItinerary = false;
  let days: DaysCode | null = null;
  let season: SeasonRef | null = null;
  let tableCount = 0;

  for (let i = 0; i < text.length; i++) {
    const raw = text[i]!;
    const n = i + 1;

    const lineHead = /^## LINHA (\d+) \((.+)\)\s*$/.exec(raw);
    if (lineHead) {
      line = { number: lineHead[1]!, name: lineHead[2]!.trim(), patterns: [] };
      lines.push(line);
      pattern = null;
      inItinerary = false;
      days = null;
      continue;
    }
    if (!line) continue;

    const sentido = /^### Sentido (\d+): (.+)$/.exec(raw);
    if (sentido) {
      pattern = newPattern(line, `L${line.number}-s${sentido[1]}`, sentido[2]!.trim(), false);
      inItinerary = false;
      days = null;
      continue;
    }
    if (/^#{3,4} Itinerário/.test(raw)) {
      if (!pattern || /Completo/.test(raw)) {
        pattern = newPattern(line, `L${line.number}`, line.name, /Circular/.test(raw));
      }
      inItinerary = true;
      continue;
    }
    if (/^#/.test(raw)) {
      inItinerary = false;
      const d = daysOf(raw);
      if (d) {
        days = d;
        season = null;
      }
      continue;
    }

    const stop = /^(\d+)\. (.+)$/.exec(raw);
    if (stop && inItinerary && pattern) {
      if (Number(stop[1]) !== pattern.stops.length + 1) {
        errors.push(`V3: md linha ${n}: ${pattern.code} pos. ${stop[1]} fora de ordem`);
      }
      pattern.stops.push(stop[2]!.trim());
      continue;
    }

    if (/não se realiza em Julho e Agosto/i.test(raw)) {
      season = JULY_AUGUST;
      continue;
    }

    if (raw.startsWith("|")) {
      // Bloco de tabela: cabeçalho, separador e linhas de dados.
      const start = i;
      while (i + 1 < text.length && text[i + 1]!.startsWith("|")) i++;
      tableCount++;
      if (!pattern || !days) {
        errors.push(`md linha ${start + 1}: tabela sem percurso ou sem título de dias`);
        continue;
      }
      const table: MdTable = { index: tableCount, mdLine: start + 3, days, season, rows: [] };
      for (let j = start + 2; j <= i; j++) {
        const row = parseRow(text[j]!, j + 1, errors);
        if (row) table.rows.push(row);
      }
      pattern.tables.push(table);
    }
  }
  return { lines, errors };
}

function newPattern(line: MdLine, code: string, label: string, isCircular: boolean): MdPattern {
  const p: MdPattern = { code, label, isCircular, stops: [], tables: [] };
  line.patterns.push(p);
  return p;
}

function daysOf(heading: string): DaysCode | null {
  if (/Dias Úteis/.test(heading)) return "util";
  if (/Sábados?, Domingos/.test(heading)) return "sab-dom-fer";
  if (/Sábado/.test(heading)) return "sab";
  if (/Domingos/.test(heading)) return "dom-fer";
  return null;
}

function parseRow(raw: string, mdLine: number, errors: string[]): MdRow | null {
  const parts = raw.split("|").map((s) => s.trim());
  const cells = parts.slice(1, parts.length - 1);
  const name = /^\*\*(.+)\*\*$/.exec(cells[0] ?? "");
  if (!name) {
    errors.push(`md linha ${mdLine}: linha de tabela sem nome em negrito`);
    return null;
  }
  const minutes = cells.slice(1).map((c) => {
    if (c === "—") return null;
    const t = /^(\d{2}):(\d{2})$/.exec(c);
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) {
      errors.push(`md linha ${mdLine}: horário ilegível "${c}"`);
      return null;
    }
    return Number(t[1]) * 60 + Number(t[2]);
  });
  return { name: name[1]!.trim(), cells: minutes, mdLine };
}

/** Nome do itinerário sem as marcas `[1]`, `[Ponto de Controlo 2]`. */
export function cleanStopName(name: string): string {
  return name.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}
