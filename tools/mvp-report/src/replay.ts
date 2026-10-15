import type { BackupTables } from "@notebus/domain/src/backup.ts";
import type { ReplayResult } from "./types.ts";

export interface ReplayOptions {
  from?: string;
  to?: string;
}

export function replay(tables: BackupTables, options: ReplayOptions = {}): ReplayResult {
  return {
    boardings: [],
    resumo: {
      total: 0,
      passed: 0,
      failed: 0,
      ratio: 0,
      verdict: "amostra pequena: 0 embarques",
    },
    failures: [],
    exclusions: {
      total: 0,
      memory: 0,
      later: 0,
      notBoarded: 0,
      unmatched: 0,
      missingSchedule: 0,
    },
  };
}
