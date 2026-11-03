/** Relatório em texto do importador: função pura, ordem fixa, sem data de geração nem relógio. */
import type { PatternVerdict } from "./reuse.ts";
import type { GenerateResult, Warning } from "./types.ts";

export interface ReportInput {
  cutoff: string;
  result: GenerateResult;
  verdicts: PatternVerdict[] | null;
  previousVersion: string | null;
  /** Chaves dos pontos da tabela de equivalência; os outros pontos do arquivo são "novos fora da tabela". */
  tableKeys?: string[];
}

const list = (items: string[]) => (items.length ? items.join(", ") : "nenhum");

function issues(kind: string, ws: Warning[]): string[] {
  return ws.flatMap((w) => [`${kind} ${w.code}: ${w.message} (${w.items.length})`, ...w.items.map((i) => `  - ${i}`)]);
}

export function formatReport({ cutoff, result, verdicts, previousVersion, tableKeys }: ReportInput): string {
  const out: string[] = [];
  const errors = result.ok ? [] : result.errors;
  const seed = result.ok ? result.seed : null;

  out.push("RELATÓRIO DO IMPORTADOR DO GTFS", "", "== Resumo ==");
  out.push(`corte: ${cutoff}`, `resultado: ${result.ok ? "ok" : "com erros, nada foi escrito"}`);
  out.push(`arquivo anterior: ${previousVersion ?? "nenhum"}`);
  if (seed) {
    const withCoords = seed.stops.filter((s) => s.lat !== undefined && s.lon !== undefined).length;
    out.push(
      `linhas: ${seed.lines.length}`,
      `percursos: ${seed.patterns.length}`,
      `pontos: ${seed.stops.length} (com coordenada: ${withCoords})`,
      `quadros: ${seed.timetables.length}`,
      `viagens: ${seed.trips.length}`,
      `horários: ${seed.stopTimes.length}`,
      `feriados: ${seed.holidays?.length ?? 0}`,
    );
  }
  out.push(`avisos: ${result.warnings.reduce((n, w) => n + w.items.length, 0)}`, `erros: ${errors.reduce((n, e) => n + e.items.length, 0)}`);

  out.push("", "== Percursos ==");
  if (!verdicts) out.push("sem arquivo anterior: nenhum percurso reaproveitado");
  else {
    const of = <S extends PatternVerdict["status"]>(s: S) => verdicts.filter((v): v is Extract<PatternVerdict, { status: S }> => v.status === s);
    const changed = of("changed");
    out.push(`mantidos (${of("kept").length}): ${list(of("kept").map((v) => v.code))}`);
    out.push(`mudados (${changed.length}): ${list(changed.map((v) => `${v.code} [${v.reasons.join(", ")}]`))}`);
    out.push(`novos (${of("new").length}): ${list(of("new").map((v) => v.code))}`);
    out.push(`removidos (${of("removed").length}): ${list(of("removed").map((v) => v.code))}`);
  }

  out.push("", "== Avisos e erros ==");
  const problems = [...issues("ERRO", errors), ...issues("AVISO", result.warnings)];
  out.push(...(problems.length ? problems : ["nenhum"]));

  out.push("", "== Exceções de data ==");
  if (!seed) out.push("sem arquivo gerado");
  else {
    // o arquivo não guarda o service_id: agrupa por tipo de dia e época, que é o que a tabela dos 7 serviços decide
    const groups = new Map<string, { notOn: Set<string>; alsoOn: Set<string> }>();
    for (const t of seed.trips) {
      const name = `${t.dayTypes.join("+")}, ${t.season ? `época ${t.season.mode} ${t.season.startMd} a ${t.season.endMd}` : "sem época"}`;
      const g = groups.get(name) ?? { notOn: new Set<string>(), alsoOn: new Set<string>() };
      t.notOn?.forEach((d) => g.notOn.add(d));
      t.alsoOn?.forEach((d) => g.alsoOn.add(d));
      groups.set(name, g);
    }
    const names = [...groups.keys()].sort();
    for (const name of names) {
      const g = groups.get(name)!;
      out.push(`${name}: notOn ${g.notOn.size} [${[...g.notOn].sort().join(", ")}]; alsoOn ${g.alsoOn.size} [${[...g.alsoOn].sort().join(", ")}]`);
    }
    if (!names.length) out.push("nenhuma viagem");
  }

  out.push("", "== Pontos novos fora da tabela ==");
  if (!seed) out.push("sem arquivo gerado");
  else if (!tableKeys) out.push("tabela de equivalência não informada");
  else {
    const known = new Set(tableKeys);
    const fresh = seed.stops.filter((s) => !known.has(s.key)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    out.push(...(fresh.length ? fresh.map((s) => `${s.key} (${s.name})`) : ["nenhum"]));
  }
  return out.join("\n") + "\n";
}
