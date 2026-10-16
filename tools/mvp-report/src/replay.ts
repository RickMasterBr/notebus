import {
  baseTimeAt,
  displayBeAtStop,
  expectedTime,
  type BaseTime,
  type MatchStatus,
  type PassageRecord,
  type PassageTarget,
  type TripData,
} from "@notebus/domain/src/passages.ts";
import { formatServiceMinute } from "@notebus/domain/src/serviceMinute.ts";
import { clampMargin } from "@notebus/domain/src/margin.ts";
import {
  dayTypeOf,
  lisbonWallClock,
  type CalendarData,
} from "@notebus/domain/src/calendar.ts";
import type { DayTypeCode } from "@notebus/domain/src/seedFormat.ts";
import type { BackupRow, BackupTables } from "@notebus/domain/src/backup.ts";
import {
  MIN_EVALUATED_BOARDINGS,
  type ExclusionDetail,
  type ExclusionReason,
  type ReplayBoarding,
  type ReplayExclusions,
  type ReplayResult,
  type ReplaySummary,
} from "./types.ts";

export { MIN_EVALUATED_BOARDINGS };

export interface ReplayOptions {
  from?: string;
  to?: string;
  exportedAt?: number | string | null;
  detail?: boolean;
}

export function parseExportedAtMs(exportedAt: unknown): number | null {
  if (typeof exportedAt === "number" && Number.isFinite(exportedAt)) return exportedAt;
  if (typeof exportedAt === "string") {
    const ms = Date.parse(exportedAt);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

export function isObservationAfterExport(obs: BackupRow, exportedAtMs: number | null): boolean {
  if (exportedAtMs === null || typeof obs.observed_at !== "number") return false;
  if (obs.observed_at > exportedAtMs) return true;
  const obsDate = lisbonWallClock(obs.observed_at).date;
  const exportDate = lisbonWallClock(exportedAtMs).date;
  return obsDate > exportDate;
}

function mergeRows(tables: BackupTables, table: string): BackupRow[] {
  const userRows = (tables as Record<string, BackupRow[]>)[table] ?? [];
  const editRows = tables.official_edits?.[table as keyof typeof tables.official_edits] ?? [];
  return [...userRows, ...editRows];
}

function getMarginMinutes(tables: BackupTables): number {
  const row = tables.setting?.find((s) => s.key === "margin_minutes");
  if (!row || row.value === null || row.value === undefined) return 2;
  const num = typeof row.value === "string" ? Number(row.value) : row.value;
  return clampMargin(num);
}

/**
 * Executa o replay do critério 4:
 * Para cada embarque ao vivo, recalcula a estimativa do domínio usando apenas
 * os registros com observedAt estritamente anterior ao dele, e verifica se o
 * embarque ocorreu em horário >= ao 'esteja no ponto às'.
 */
export function replay(tables: BackupTables, options: ReplayOptions = {}): ReplayResult {
  const marginMinutes = getMarginMinutes(tables);
  const exportedAtMs = parseExportedAtMs(options.exportedAt);

  const linesById = new Map<string, { id: string; code: string; name: string }>();
  for (const r of mergeRows(tables, "line")) {
    if (r.id !== null && r.id !== undefined && r.id !== "") {
      linesById.set(String(r.id), { id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? "") });
    }
  }

  const stopsById = new Map<string, { id: string; name: string }>();
  for (const r of mergeRows(tables, "stop")) {
    if (r.id !== null && r.id !== undefined && r.id !== "") {
      stopsById.set(String(r.id), { id: String(r.id), name: String(r.name ?? "") });
    }
  }

  const patternStopsById = new Map<string, { id: string; patternId: string; stopId: string; position: number }>();
  for (const r of mergeRows(tables, "pattern_stop")) {
    if (
      r.id !== null &&
      r.id !== undefined &&
      r.id !== "" &&
      r.pattern_id &&
      r.stop_id &&
      r.position !== null &&
      r.position !== undefined
    ) {
      patternStopsById.set(String(r.id), {
        id: String(r.id),
        patternId: String(r.pattern_id),
        stopId: String(r.stop_id),
        position: Number(r.position),
      });
    }
  }

  const tripsById = new Map<string, { id: string; timetableId: string; firstPosition: number; lastPosition: number }>();
  for (const r of mergeRows(tables, "trip")) {
    if (r.id !== null && r.id !== undefined && r.id !== "") {
      tripsById.set(String(r.id), {
        id: String(r.id),
        timetableId: String(r.timetable_id ?? ""),
        firstPosition: Number(r.first_position ?? 1),
        lastPosition: Number(r.last_position ?? 999),
      });
    }
  }

  const stopTimesByTrip = new Map<string, Array<{ position: number; serviceMinute: number; origin: "official" | "declared" }>>();
  for (const r of mergeRows(tables, "stop_time")) {
    if (r.trip_id && r.pattern_stop_id && r.service_minute !== null && r.service_minute !== undefined) {
      const ps = patternStopsById.get(String(r.pattern_stop_id));
      if (ps) {
        const list = stopTimesByTrip.get(String(r.trip_id)) ?? [];
        list.push({
          position: ps.position,
          serviceMinute: Number(r.service_minute),
          origin: r.origin === "declared" ? "declared" : "official",
        });
        stopTimesByTrip.set(String(r.trip_id), list);
      }
    }
  }

  const timetablesById = new Map<string, { id: string; validFrom: string | null }>();
  for (const r of mergeRows(tables, "timetable")) {
    if (r.id !== null && r.id !== undefined && r.id !== "") {
      timetablesById.set(String(r.id), {
        id: String(r.id),
        validFrom: r.valid_from ? String(r.valid_from) : null,
      });
    }
  }

  const calendar: CalendarData = {
    overrides: mergeRows(tables, "date_override")
      .filter((r) => r.date && r.day_type_id)
      .map((r) => ({
        date: String(r.date),
        dayType: String(r.day_type_id) as DayTypeCode,
      })),
    holidays: mergeRows(tables, "holiday")
      .filter((r) => r.date && r.name)
      .map((r) => ({
        date: String(r.date),
        name: String(r.name),
        scope: (r.scope as "municipal" | "manual") ?? undefined,
        recurring: r.recurring === 1 || r.recurring === "1",
      })),
  };

  const allPassageRecords: PassageRecord[] = [];
  for (const obs of tables.observation ?? []) {
    if (obs.deleted_at !== null) continue;
    if (isObservationAfterExport(obs, exportedAtMs)) continue;
    if (obs.match_status !== "auto" && obs.match_status !== "manual") continue;
    if (
      !obs.trip_id ||
      !obs.pattern_stop_id ||
      obs.deviation_min === null ||
      obs.deviation_min === undefined ||
      !obs.service_date ||
      obs.observed_at === null ||
      obs.observed_at === undefined
    ) {
      continue;
    }

    const ps = patternStopsById.get(String(obs.pattern_stop_id));
    if (!ps) continue;

    const dayType = dayTypeOf(String(obs.service_date), calendar).dayType;
    allPassageRecords.push({
      deviation: Number(obs.deviation_min),
      observedAt: Number(obs.observed_at),
      serviceDate: String(obs.service_date),
      dayType,
      tripId: String(obs.trip_id),
      patternId: ps.patternId,
      position: ps.position,
      stopId: ps.stopId,
      matchStatus: obs.match_status as MatchStatus,
      mode: (obs.mode as "live" | "later" | "memory") ?? "live",
      kind: (obs.kind as "boarded" | "passed" | "alighted") ?? "boarded",
    });
  }

  const exclusions: ReplayExclusions = {
    total: 0,
    memory: 0,
    later: 0,
    notBoarded: 0,
    unmatched: 0,
    missingSchedule: 0,
  };

  const exclusionDetails: Record<ExclusionReason, ExclusionDetail[]> = {
    memory: [],
    later: [],
    notBoarded: [],
    unmatched: [],
    missingSchedule: [],
  };

  const candidates: BackupRow[] = [];

  for (const obs of tables.observation ?? []) {
    if (obs.deleted_at !== null) continue;
    if (isObservationAfterExport(obs, exportedAtMs)) continue;

    const localDate =
      typeof obs.observed_at === "number"
        ? lisbonWallClock(obs.observed_at).date
        : String(obs.service_date ?? "");

    if (typeof obs.observed_at === "number") {
      if (options.from && localDate < options.from) continue;
      if (options.to && localDate > options.to) continue;
    }

    if (obs.mode !== "live") {
      exclusions.total++;
      const reason: ExclusionReason = obs.mode === "later" ? "later" : "memory";
      if (obs.mode === "later") exclusions.later++;
      else exclusions.memory++;
      exclusionDetails[reason].push({
        observationId: String(obs.id),
        date: localDate,
        reason,
        detail: `modo: ${obs.mode}`,
      });
      continue;
    }

    if (obs.kind !== "boarded") {
      exclusions.total++;
      exclusions.notBoarded++;
      exclusionDetails.notBoarded.push({
        observationId: String(obs.id),
        date: localDate,
        reason: "notBoarded",
        detail: `tipo: ${obs.kind}`,
      });
      continue;
    }

    const hasMatch =
      (obs.match_status === "auto" || obs.match_status === "manual") &&
      Boolean(obs.trip_id) &&
      Boolean(obs.pattern_stop_id) &&
      obs.deviation_min !== null &&
      obs.deviation_min !== undefined;

    if (!hasMatch) {
      exclusions.total++;
      exclusions.unmatched++;
      const matchDesc = !obs.trip_id
        ? "trip_id ausente"
        : !obs.pattern_stop_id
        ? "pattern_stop_id ausente"
        : obs.deviation_min === null || obs.deviation_min === undefined
        ? "deviation_min ausente"
        : `match_status=${obs.match_status}`;
      exclusionDetails.unmatched.push({
        observationId: String(obs.id),
        date: localDate,
        reason: "unmatched",
        detail: `sem viagem casada (${matchDesc})`,
      });
      continue;
    }

    const lineIdVal = obs.line_id;
    const stopIdVal = obs.stop_id;
    const psIdVal = obs.pattern_stop_id;

    const line =
      lineIdVal !== null && lineIdVal !== undefined && lineIdVal !== ""
        ? linesById.get(String(lineIdVal))
        : undefined;
    const stop =
      stopIdVal !== null && stopIdVal !== undefined && stopIdVal !== ""
        ? stopsById.get(String(stopIdVal))
        : undefined;
    const ps =
      psIdVal !== null && psIdVal !== undefined && psIdVal !== ""
        ? patternStopsById.get(String(psIdVal))
        : undefined;

    if (!line || !stop || !ps) {
      exclusions.total++;
      exclusions.missingSchedule++;
      const failedQual: string[] = [];
      const failedValues: string[] = [];
      if (!line) {
        failedQual.push("line_id");
        const valStr =
          lineIdVal !== null && lineIdVal !== undefined && lineIdVal !== ""
            ? `"${lineIdVal}" (ausente no dataset)`
            : "vazio";
        failedValues.push(`line_id=${valStr}`);
      }
      if (!stop) {
        failedQual.push("stop_id");
        const valStr =
          stopIdVal !== null && stopIdVal !== undefined && stopIdVal !== ""
            ? `"${stopIdVal}" (ausente no dataset)`
            : "vazio";
        failedValues.push(`stop_id=${valStr}`);
      }
      if (!ps) {
        failedQual.push("pattern_stop_id");
        const valStr =
          psIdVal !== null && psIdVal !== undefined && psIdVal !== ""
            ? `"${psIdVal}" (ausente no dataset)`
            : "vazio";
        failedValues.push(`pattern_stop_id=${valStr}`);
      }
      const qual = failedQual.join(", ");
      const valDesc = failedValues.join(", ");
      exclusionDetails.missingSchedule.push({
        observationId: String(obs.id),
        date: localDate,
        reason: "missingSchedule",
        qual,
        value: lineIdVal
          ? String(lineIdVal)
          : stopIdVal
          ? String(stopIdVal)
          : psIdVal
          ? String(psIdVal)
          : null,
        detail: `qual: ${qual} | valor: ${valDesc}`,
      });
      continue;
    }

    candidates.push(obs);
  }

  candidates.sort((a, b) => Number(a.observed_at) - Number(b.observed_at));

  const boardings: ReplayBoarding[] = [];

  for (const obs of candidates) {
    const obsAt = Number(obs.observed_at);
    // Estimativa usa estritamente os registros anteriores àquele
    const priorRecords = allPassageRecords.filter((r) => r.observedAt < obsAt);

    const ps = patternStopsById.get(String(obs.pattern_stop_id))!;
    const line = linesById.get(String(obs.line_id))!;
    const stop = stopsById.get(String(obs.stop_id))!;
    const tripId = String(obs.trip_id);
    const trip = tripsById.get(tripId);
    const timetable = trip ? timetablesById.get(trip.timetableId) : undefined;
    const validFrom = timetable?.validFrom ?? null;
    const dayType = dayTypeOf(String(obs.service_date), calendar).dayType;

    const target: PassageTarget = {
      tripId,
      patternId: ps.patternId,
      position: ps.position,
      stopId: ps.stopId,
      dayType,
      validFrom,
    };

    let base: BaseTime | null = null;
    if (trip && stopTimesByTrip.has(trip.id)) {
      const tripData: TripData = {
        id: trip.id,
        patternId: ps.patternId,
        firstPosition: trip.firstPosition,
        lastPosition: trip.lastPosition,
        stopTimes: stopTimesByTrip.get(trip.id) ?? [],
      };
      try {
        base = baseTimeAt(tripData, ps.position);
      } catch {
        base = null;
      }
    }

    if (!base) {
      const baseMinute = Number(obs.service_minute) - Number(obs.deviation_min);
      base = { position: ps.position, minute: baseMinute, kind: "interpolated" };
    }

    const exp = expectedTime(base, priorRecords, {
      target,
      now: obsAt,
      marginMinutes,
    });

    const shouldBeAtMinute = displayBeAtStop(exp.beAtStop);
    const shouldBeAt = formatServiceMinute(shouldBeAtMinute);

    const boardedMinute = Math.floor(Number(obs.service_minute));
    const passed = boardedMinute >= shouldBeAtMinute;

    boardings.push({
      observationId: String(obs.id),
      observedAt: obsAt,
      shouldBeAt,
      passed,
      deviationMinutes: Number(obs.deviation_min),
      lineCode: line.code,
      stopName: stop.name,
    });
  }

  const total = boardings.length;
  const passedCount = boardings.filter((b) => b.passed).length;
  const failedCount = total - passedCount;
  const ratio = total > 0 ? passedCount / total : 0;
  const failures = boardings.filter((b) => !b.passed);

  let verdict: string;
  if (total < MIN_EVALUATED_BOARDINGS) {
    verdict = `amostra pequena: ${total} embarques`;
  } else if (ratio >= 0.9) {
    verdict = "passou";
  } else {
    verdict = "não passou";
  }

  exclusions.details = exclusionDetails;

  const resumo: ReplaySummary = {
    total,
    passed: passedCount,
    failed: failedCount,
    ratio,
    verdict,
  };

  return {
    boardings,
    resumo,
    failures,
    exclusions,
  };
}
