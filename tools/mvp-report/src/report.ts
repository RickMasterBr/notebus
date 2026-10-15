/** Formatação do relatório em texto e JSON para o mvp-report. */
import type { MvpReportResult } from "./types.ts";

/** Formata o resultado da análise em texto simples em português do Brasil, sem emoji (D-171). */
export function formatReportText(report: MvpReportResult): string {
  const lines: string[] = [];
  lines.push("=== Relatório do MVP NoteBus ===");
  lines.push(`Arquivo: ${report.file}`);
  if (report.exportedAt) {
    lines.push(`Exportado em: ${report.exportedAt}`);
  }
  if (report.from || report.to) {
    lines.push(`Período analisado: ${report.from ?? "início"} a ${report.to ?? "fim"}`);
  }
  lines.push("");

  // Critério 2: Dias com registro
  lines.push("--- Critério 2: Uso ao vivo ---");
  const u = report.criterio2;
  if (u.daysWithRecord > 0) {
    lines.push(`${u.daysWithRecord} dias com pelo menos 1 registro, de ${u.firstDay} a ${u.lastDay}, ${u.totalRecords} registros ao todo`);
  } else {
    lines.push("0 dias com pelo menos 1 registro, 0 registros ao todo");
  }
  lines.push("");

  // Critério 4: Replay
  lines.push("--- Critério 4: Replay do 'esteja no ponto às' ---");
  const r = report.criterio4;
  const s = r.resumo;
  lines.push(`Total de embarques avaliados: ${s.total}`);
  lines.push(`Passaram: ${s.passed}`);
  lines.push(`Falharam: ${s.failed}`);
  if (s.total >= 10) {
    const pct = Math.round(s.ratio * 100);
    lines.push(`Resultado: ${s.passed} de ${s.total} (${pct}%): ${s.verdict}`);
  } else {
    lines.push(`Resultado: amostra pequena: ${s.total} embarques`);
  }
  lines.push("");

  if (r.failures.length > 0) {
    lines.push("Embarques que falharam:");
    for (const f of r.failures) {
      const dev = f.deviationMinutes >= 0 ? `+${f.deviationMinutes}` : `${f.deviationMinutes}`;
      lines.push(
        `- Linha ${f.lineCode}, ponto ${f.stopName}: esteja às ${f.shouldBeAt}, desvio ${dev} min (ID: ${f.observationId})`
      );
    }
    lines.push("");
  }

  // Exclusões
  const ex = r.exclusions;
  lines.push(
    `Exclusões: ${ex.total} excluídos (${ex.memory} de memória, ${ex.later} ajustados, ${ex.notBoarded} não embarque, ${ex.unmatched} sem viagem casada, ${ex.missingSchedule} sem linha ou ponto no dataset)`
  );
  lines.push("");
  lines.push(
    "Limite honesto: o replay usa o modelo de hoje com os dados de então; se o Rick declarou horário ou editou registro depois, o replay vê a versão editada."
  );

  return lines.join("\n");
}
