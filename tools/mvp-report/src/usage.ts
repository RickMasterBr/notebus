/** Critério 2: Contagem de dias com registro ao vivo pelo fuso local de Lisboa. */
import { lisbonWallClock } from "@notebus/domain/src/calendar.ts";
import type { BackupTables } from "@notebus/domain/src/backup.ts";
import type { UsageSummary } from "./types.ts";

export interface UsageOptions {
  from?: string;
  to?: string;
}

/**
 * Conta registros ao vivo por dia local de Lisboa (D-093).
 *
 * Registros de memória (`mode = "memory"`) e ajustados (`mode = "later"`) não entram.
 * Registros apagados (`deleted_at !== null`) não entram.
 */
export function calculateUsage(
  tables: BackupTables,
  options: UsageOptions = {}
): UsageSummary {
  const perDay: Record<string, number> = {};
  const observations = tables.observation ?? [];

  for (const obs of observations) {
    if (obs.deleted_at !== null) continue;
    if (obs.mode !== "live") continue;
    if (typeof obs.observed_at !== "number") continue;

    // Data no fuso local de Lisboa pelo relógio de parede do domínio (D-093)
    const date = lisbonWallClock(obs.observed_at).date;

    if (options.from && date < options.from) continue;
    if (options.to && date > options.to) continue;

    perDay[date] = (perDay[date] ?? 0) + 1;
  }

  const sortedDays = Object.keys(perDay).sort();
  const daysWithRecord = sortedDays.length;
  const totalRecords = Object.values(perDay).reduce((sum, n) => sum + n, 0);
  const firstDay = sortedDays[0] ?? null;
  const lastDay = sortedDays[sortedDays.length - 1] ?? null;

  return {
    daysWithRecord,
    firstDay,
    lastDay,
    totalRecords,
    perDay,
  };
}
