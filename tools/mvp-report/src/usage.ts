import type { BackupTables } from "@notebus/domain/src/backup.ts";
import type { UsageSummary } from "./types.ts";

export interface UsageOptions {
  from?: string;
  to?: string;
}

export function calculateUsage(tables: BackupTables, options: UsageOptions = {}): UsageSummary {
  return {
    daysWithRecord: 0,
    firstDay: null,
    lastDay: null,
    totalRecords: 0,
    perDay: {},
  };
}
