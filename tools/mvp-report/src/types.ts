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

export const MIN_EVALUATED_BOARDINGS = 10;

export type ExclusionReason =
  | "memory"
  | "later"
  | "notBoarded"
  | "unmatched"
  | "missingSchedule";

export interface ExclusionDetail {
  observationId: string;
  date: string;
  reason: ExclusionReason;
  qual?: "line_id" | "stop_id" | "pattern_stop_id" | string;
  value?: string | null;
  status?: string;
  detail: string;
}

export interface ReplayExclusions {
  total: number;
  memory: number;
  later: number;
  notBoarded: number;
  unmatched: number;
  missingSchedule: number;
  officialWithoutSeed?: number;
  details?: Record<ExclusionReason, ExclusionDetail[]>;
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
  futureRecords?: number;
}

export interface MvpReportResult {
  file: string;
  seedFile?: string | null;
  exportedAt: string | null;
  from?: string;
  to?: string;
  criterio2: UsageSummary;
  criterio4: ReplayResult;
  futureRecords?: number;
  detail?: boolean;
}

