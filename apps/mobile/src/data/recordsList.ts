/**
 * Modelo de dados da TL-08 Registros (E-04 §4.2, UC-14).
 * Puro: sem React, sem banco, sem relógio.
 */
import { addDays, dayOfWeek, lisbonWallClock } from "@notebus/domain";
import { reviewQueue, notVerified } from "./review";
import type { ObservationRow } from "./registro";
import type { ScheduleSnapshot, LineInfo } from "./schedule";
import { clockText } from "./stopCard";
import type { SheetContent } from "../sheets/stack";
import { type MessageKey, t } from "../i18n";
import { colors } from "../theme/tokens";

export interface RecordListRow {
  id: string;
  time: string;
  line: {
    code: string;
    color: string;
  };
  stop: {
    id: string;
    name: string;
  };
  kind: "boarded" | "alighted" | "passed";
  verifyState: "pending" | "notVerified" | null;
  observedAt: number;
  serviceDate: string;
  observation: ObservationRow;
}

export interface RecordDayGroup {
  serviceDate: string;
  label: string;
  rows: RecordListRow[];
}

export interface RecordsListModel {
  pending: RecordListRow[];
  days: RecordDayGroup[];
  hasMore: boolean;
  windowDays: number;
  loadMore: (days?: number) => RecordsListModel;
}

export type RecordsSnapshotDeps =
  | ScheduleSnapshot
  | {
      lineInfo?: Map<string, LineInfo>;
      stopNames?: Map<string, string>;
    };

const SHORT_WEEKDAY_KEYS = [
  "common.weekday.short.0",
  "common.weekday.short.1",
  "common.weekday.short.2",
  "common.weekday.short.3",
  "common.weekday.short.4",
  "common.weekday.short.5",
  "common.weekday.short.6",
] as const satisfies readonly MessageKey[];

export function formatDayHeader(serviceDate: string, nowDate: string): string {
  if (serviceDate === nowDate) return t("common.today");
  if (serviceDate === addDays(nowDate, -1)) return t("common.yesterday");
  const dow = dayOfWeek(serviceDate);
  const weekday = SHORT_WEEKDAY_KEYS[dow] ? t(SHORT_WEEKDAY_KEYS[dow]) : "";
  const dd = serviceDate.slice(8, 10);
  const mm = serviceDate.slice(5, 7);
  return `${weekday} ${dd}/${mm}`;
}

export function formatRowTime(row: Pick<ObservationRow, "observedAt" | "observedEndAt">): string {
  if (row.observedEndAt != null) {
    const start = clockText(lisbonWallClock(row.observedAt).minute);
    const end = clockText(lisbonWallClock(row.observedEndAt).minute);
    return `${start}–${end}`;
  }
  return clockText(lisbonWallClock(row.observedAt).minute);
}

export function serviceDateOfRow(row: Pick<ObservationRow, "serviceDate" | "observedAt">): string {
  return row.serviceDate ?? lisbonWallClock(row.observedAt).date;
}

function makeRecordListRow(
  row: ObservationRow,
  verifyState: "pending" | "notVerified" | null,
  snapshot?: RecordsSnapshotDeps | null,
): RecordListRow {
  const lineInfo = snapshot?.lineInfo?.get(row.lineId);
  const line = {
    code: lineInfo?.code ?? row.lineId,
    color: lineInfo?.color ?? colors.light.textSecondary,
  };
  const stopName = snapshot?.stopNames?.get(row.stopId) ?? row.stopId;
  const stop = {
    id: row.stopId,
    name: stopName,
  };
  const time = formatRowTime(row);
  const serviceDate = serviceDateOfRow(row);

  return {
    id: row.id,
    time,
    line,
    stop,
    kind: row.kind,
    verifyState,
    observedAt: row.observedAt,
    serviceDate,
    observation: row,
  };
}

export function rowTarget(row: { id: string; verifyState?: "pending" | "notVerified" | null }): SheetContent {
  if (row.verifyState === "pending" || row.verifyState === "notVerified") {
    return { kind: "verify", observationId: row.id };
  }
  return { kind: "record", observationId: row.id };
}

export function buildRecordsList(
  observations: readonly ObservationRow[],
  snapshot: RecordsSnapshotDeps | null,
  now: number,
  windowDays = 14,
): RecordsListModel {
  const live = observations.filter((o) => o.deletedAt == null);

  const pendingObs = reviewQueue(live);
  const dismissedObs = notVerified(live);
  const pendingIds = new Set(pendingObs.map((o) => o.id));
  const dismissedIds = new Set(dismissedObs.map((o) => o.id));

  const verifyStateOf = (id: string): "pending" | "notVerified" | null => {
    if (pendingIds.has(id)) return "pending";
    if (dismissedIds.has(id)) return "notVerified";
    return null;
  };

  const pending = pendingObs.map((row) => makeRecordListRow(row, "pending", snapshot));

  const nowDate = lisbonWallClock(now).date;
  const minDate = addDays(nowDate, -(windowDays - 1));

  // Agrupamento por dia de serviço
  const dayBuckets = new Map<string, ObservationRow[]>();
  let hasOlderRecords = false;

  for (const row of live) {
    const sDate = serviceDateOfRow(row);
    if (sDate < minDate) {
      hasOlderRecords = true;
      continue;
    }
    // Não exibe datas futuras se houver
    if (sDate > nowDate) {
      continue;
    }
    let list = dayBuckets.get(sDate);
    if (!list) {
      list = [];
      dayBuckets.set(sDate, list);
    }
    list.push(row);
  }

  const sortedDates = [...dayBuckets.keys()].sort((a, b) => b.localeCompare(a));
  const days: RecordDayGroup[] = sortedDates.map((sDate) => {
    const dayRows = dayBuckets.get(sDate)!;
    // Dentro do dia, do mais novo ao mais antigo
    dayRows.sort((a, b) => b.observedAt - a.observedAt);
    const mappedRows = dayRows.map((r) => makeRecordListRow(r, verifyStateOf(r.id), snapshot));
    const label = formatDayHeader(sDate, nowDate);
    return {
      serviceDate: sDate,
      label,
      rows: mappedRows,
    };
  });

  return {
    pending,
    days,
    hasMore: hasOlderRecords,
    windowDays,
    loadMore: (daysToAdd = 14) => buildRecordsList(observations, snapshot, now, windowDays + daysToAdd),
  };
}
