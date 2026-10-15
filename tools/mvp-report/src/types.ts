/** Tipos do pacote @notebus/mvp-report (E-09 Bloco 8). */

export interface ReplayBoarding {
  observationId: string;
  observedAt: number;
  shouldBeAt: string;
  passed: boolean;
  deviationMinutes: number;
  lineCode: string;
  stopName: string;
}

export interface ReplaySummary {
  total: number;
  passed: number;
  failed: number;
  ratio: number;
  verdict: string;
}

export interface ReplayExclusions {
  total: number;
  memory: number;
  later: number;
  notBoarded: number;
  unmatched: number;
  missingSchedule: number;
}

export interface ReplayResult {
  boardings: ReplayBoarding[];
  resumo: ReplaySummary;
  failures: ReplayBoarding[];
  exclusions: ReplayExclusions;
}

export interface UsageSummary {
  daysWithRecord: number;
  firstDay: string | null;
  lastDay: string | null;
  totalRecords: number;
  perDay: Record<string, number>;
}

export interface MvpReportResult {
  file: string;
  exportedAt: string | null;
  from?: string;
  to?: string;
  criterio2: UsageSummary;
  criterio4: ReplayResult;
}
