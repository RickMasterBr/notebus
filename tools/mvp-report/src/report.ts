/** Formatação do relatório em texto e JSON para o mvp-report. */
import { MIN_EVALUATED_BOARDINGS, type ExclusionReason, type MvpReportResult } from "./types.ts";

/** Formata o resultado da análise em texto simples em português do Brasil, sem emoji (D-171). */
export function formatReportText(report: MvpReportResult): string {
  const lines: string[] = [];
  lines.push("=== Relatório do MVP NoteBus ===");
  lines.push(`Arquivo: ${report.file}`);
  if (report.seedFile) {
    lines.push(`Seed: ${report.seedFile}`); // provisório
  }
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
  const futureCount = report.futureRecords ?? u.futureRecords ?? 0;
  if (futureCount > 0) {
    lines.push(`registros datados depois da exportação (relógio de teste): ${futureCount}`);
  }
  lines.push("");

  // Critério 4: Replay
  lines.push("--- Critério 4: Replay do 'esteja no ponto às' ---");
  const r = report.criterio4;
  const s = r.resumo;
  lines.push(`Total de embarques avaliados: ${s.total}`);
  lines.push(`Passaram: ${s.passed}`);
  lines.push(`Falharam: ${s.failed}`);
  if (s.total >= MIN_EVALUATED_BOARDINGS) {
    const pct = Math.round(s.ratio * 100);
    lines.push(`Resultado: ${s.passed} de ${s.total} (${pct}%): ${s.verdict}`);
  } else {
    const missing = MIN_EVALUATED_BOARDINGS - s.total;
    lines.push(`Resultado: amostra pequena: ${s.total} embarques (faltam ${missing})`);
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
  if (ex.officialWithoutSeed && ex.officialWithoutSeed > 0) {
    lines.push(
      `${ex.officialWithoutSeed} registros em linhas oficiais não podem ser avaliados sem o seed: use --seed <arquivo>` // provisório
    );
  }
  if (report.detail) {
    const details = ex.details;
    if (details) {
      lines.push("");
      lines.push("Detalhe das exclusões:");
      const sections: Array<{ key: ExclusionReason; label: string; count: number }> = [
        { key: "memory", label: "De memória", count: ex.memory },
        { key: "later", label: "Ajustados", count: ex.later },
        { key: "notBoarded", label: "Não embarque", count: ex.notBoarded },
        { key: "unmatched", label: "Sem viagem casada", count: ex.unmatched },
        { key: "missingSchedule", label: "Sem linha ou ponto no dataset", count: ex.missingSchedule },
      ];
      for (const sec of sections) {
        if (sec.count > 0) {
          lines.push(`- ${sec.label} (${sec.count}):`);
          const items = details[sec.key] ?? [];
          const top10 = items.slice(0, 10);
          for (const item of top10) {
            lines.push(`  * ID ${item.observationId} | ${item.date} | ${item.detail}`);
          }
          if (items.length > 10) {
            lines.push(`  * ... e mais ${items.length - 10} registros`);
          }
        }
      }
    }
  }
  lines.push("");
  lines.push(
    "Limite honesto: o replay usa o modelo de hoje com os dados de então; se o Rick declarou horário ou editou registro depois, o replay vê a versão editada."
  );

  return lines.join("\n");
}
