/** CLI do relatório de critérios do MVP (@notebus/mvp-report). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { lisbonWallClock } from "@notebus/domain/src/calendar.ts";
import { isObservationAfterExport, parseExportedAtMs, replay } from "./replay.ts";
import { formatReportText } from "./report.ts";
import type { MvpReportResult } from "./types.ts";
import { calculateUsage } from "./usage.ts";
import { validateBackupText } from "./validate.ts";

export interface CliOptions {
  filePath?: string;
  from?: string;
  to?: string;
  jsonPath?: string;
  detail?: boolean;
  help?: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--from" && i + 1 < args.length) {
      opts.from = args[++i];
    } else if (arg === "--to" && i + 1 < args.length) {
      opts.to = args[++i];
    } else if (arg === "--json" && i + 1 < args.length) {
      opts.jsonPath = args[++i];
    } else if (arg === "--detalhe") {
      opts.detail = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (!arg.startsWith("--") && !opts.filePath) {
      opts.filePath = arg;
    }
  }
  return opts;
}

/**
 * Ponto de entrada do CLI testável.
 *
 * @param args - Argumentos de linha de comando (sem node nem script)
 * @param log - Injetor de saída padrão (default: console.log)
 * @param err - Injetor de saída de erro (default: console.error)
 * @returns 0 em sucesso, 1 em erro
 */
export async function main(
  args: string[],
  log: (msg: string) => void = console.log,
  err: (msg: string) => void = console.error
): Promise<number> {
  const opts = parseArgs(args);

  if (opts.help || !opts.filePath) {
    err(
      "Uso: npm --workspace=@notebus/mvp-report start -- <arquivo-de-backup.json> [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--json <saida.json>] [--detalhe]"
    );
    return 1;
  }

  if (!existsSync(opts.filePath)) {
    err(`Arquivo não encontrado: ${opts.filePath}`);
    return 1;
  }

  let text: string;
  try {
    text = readFileSync(opts.filePath, "utf8");
  } catch (e) {
    err(`Erro ao ler arquivo: ${String(e)}`);
    return 1;
  }

  const validation = await validateBackupText(text);
  if (!validation.ok) {
    err(validation.error);
    return 1;
  }

  const backup = validation.backup;
  const exportedAtMs = parseExportedAtMs(backup.exportedAt);
  const futureRecords = (backup.tables.observation ?? []).filter((o) =>
    isObservationAfterExport(o, exportedAtMs)
  ).length;

  // Se --from e --to não forem informados, usa os últimos 14 dias com registro ao vivo
  let from = opts.from;
  let to = opts.to;
  if (!from && !to) {
    const liveObs = (backup.tables.observation ?? []).filter(
      (o) =>
        o.deleted_at === null &&
        o.mode === "live" &&
        typeof o.observed_at === "number" &&
        !isObservationAfterExport(o, exportedAtMs)
    );
    const liveDates = [...new Set(liveObs.map((o) => lisbonWallClock(Number(o.observed_at)).date))].sort();
    if (liveDates.length > 14) {
      from = liveDates[liveDates.length - 14];
      to = liveDates[liveDates.length - 1];
    } else if (liveDates.length > 0) {
      from = liveDates[0];
      to = liveDates[liveDates.length - 1];
    }
  }

  const uso = calculateUsage(backup.tables, { from, to, exportedAt: exportedAtMs });
  const rep = replay(backup.tables, { from, to, exportedAt: exportedAtMs, detail: opts.detail });

  const reportResult: MvpReportResult = {
    file: opts.filePath,
    exportedAt: backup.exportedAt ?? null,
    from,
    to,
    criterio2: uso,
    criterio4: rep,
    futureRecords,
    detail: opts.detail,
  };

  const reportText = formatReportText(reportResult);
  log(reportText);

  if (opts.jsonPath) {
    try {
      writeFileSync(opts.jsonPath, JSON.stringify(reportResult, null, 2), "utf8");
    } catch (e) {
      err(`Erro ao gravar JSON de saída: ${String(e)}`);
      return 1;
    }
  }

  return 0;
}
