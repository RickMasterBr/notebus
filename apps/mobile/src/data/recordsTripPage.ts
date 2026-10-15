/**
 * Modelo de dados para a página interna da viagem na folha Registros (E-08.5 Bloco 16, D-206, D-207).
 * Puro: sem React, sem banco, sem relógio.
 */
import { baseTimeAt, lisbonWallClock, type TripData } from "@notebus/domain";
import type { MessageKey } from "../i18n";
import { notVerified, reviewQueue } from "./review";
import type { ObservationRow, RideRow } from "./registro";
import {
  formatDayHeader,
  formatRowTime,
  serviceDateOfRow,
  type RecordsSnapshotDeps,
} from "./recordsList";
import {
  calcDurationMin,
  resolveStopName,
  resolveTripLine,
} from "./recordsTrips";
import { patternStopKey, type ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

export interface TripPageModel {
  line: {
    code: string;
    color: string;
  };
  fromName: string;
  toName: string | null;
  dayLabel: string;
  durationMin: number | null;
  ongoing: boolean;
  boarding: {
    id: string;
    time: string;
    stopName: string;
    tableTime: string | null;
    delta: {
      key: MessageKey;
      n: number;
    } | null;
  };
  alighting: {
    id: string;
    time: string;
    stopName: string;
  } | null;
  learn: "learns" | "unmatched";
  originTable: {
    time: string;
    stopName: string;
  } | null;
  note: string | null;
  verifyId: string | null;
  deleteKind: "pair" | "single";
}

function resolveFirstStopName(
  trip: TripData,
  snapshot: RecordsSnapshotDeps | null,
): string | null {
  if (!snapshot) return null;
  const fullSnap = snapshot as ScheduleSnapshot;

  let stopId: string | undefined;
  if (fullSnap.patterns) {
    const pat = fullSnap.patterns.find((p) => p.id === trip.patternId);
    const firstStop = pat?.stops.find((s) => s.position === trip.firstPosition);
    stopId = firstStop?.stopId;
  }

  if (!stopId && fullSnap.patternStopIds && fullSnap.patternStopById) {
    const psKey = patternStopKey(trip.patternId, trip.firstPosition);
    const psId = fullSnap.patternStopIds.get(psKey);
    if (psId) {
      stopId = fullSnap.patternStopById.get(psId)?.stopId;
    }
  }

  if (!stopId) return null;
  return resolveStopName(stopId, snapshot);
}

export function tripPageModel(input: {
  boardingId: string;
  observations: readonly ObservationRow[];
  rides: readonly RideRow[];
  snapshot: RecordsSnapshotDeps | null;
  now: number;
}): TripPageModel | null {
  const boarding = input.observations.find(
    (o) => o.id === input.boardingId && o.deletedAt == null,
  );
  if (!boarding) return null;

  const liveObservations = input.observations.filter((o) => o.deletedAt == null);

  const ride = input.rides.find(
    (r) =>
      r.deletedAt == null &&
      (r.boardingObservationId === boarding.id ||
        (boarding.rideId != null && r.id === boarding.rideId)),
  );

  const alightingObs =
    ride && ride.alightingObservationId
      ? (liveObservations.find((o) => o.id === ride.alightingObservationId) ?? null)
      : null;

  const line = resolveTripLine(boarding.lineId, input.snapshot);
  const fromName = resolveStopName(boarding.stopId, input.snapshot);
  const toName = alightingObs ? resolveStopName(alightingObs.stopId, input.snapshot) : null;

  const nowDate = lisbonWallClock(input.now).date;
  const serviceDate = serviceDateOfRow(boarding);
  const dayLabel = formatDayHeader(serviceDate, nowDate);

  const durationMin = calcDurationMin(boarding, alightingObs);
  const ongoing = !!(ride && ride.status === "open");

  // tableTime
  let tableTime: string | null = null;
  const fullSnap = input.snapshot as ScheduleSnapshot | null;
  let trip: TripData | undefined;
  if (fullSnap && fullSnap.trips && boarding.tripId) {
    trip = fullSnap.trips.find((t) => t.id === boarding.tripId);
    if (trip && boarding.patternStopId && fullSnap.patternStopById) {
      const ps = fullSnap.patternStopById.get(boarding.patternStopId);
      if (ps) {
        try {
          const bt = baseTimeAt(trip, ps.position);
          if (bt != null) {
            tableTime = clockText(Math.floor(bt.minute));
          }
        } catch {
          tableTime = null;
        }
      }
    }
  }

  // delta
  let delta: { key: MessageKey; n: number } | null = null;
  if (
    (boarding.matchStatus === "auto" || boarding.matchStatus === "manual") &&
    boarding.deviationMin !== null
  ) {
    const raw = Math.round(boarding.deviationMin);
    const n = Math.abs(raw);
    const key: MessageKey =
      raw > 0
        ? "sheet_record.relative.late"
        : raw < 0
          ? "sheet_record.relative.early"
          : "sheet_record.relative.on_time";
    delta = { key, n };
  }

  const boardingModel = {
    id: boarding.id,
    time: formatRowTime(boarding),
    stopName: fromName,
    tableTime,
    delta,
  };

  const alightingModel = alightingObs
    ? {
        id: alightingObs.id,
        time: formatRowTime(alightingObs),
        stopName: resolveStopName(alightingObs.stopId, input.snapshot),
      }
    : null;

  const learns =
    (boarding.matchStatus === "auto" || boarding.matchStatus === "manual") &&
    boarding.tripId != null &&
    boarding.patternStopId != null &&
    boarding.deviationMin != null &&
    boarding.serviceDate != null;
  const learn: "learns" | "unmatched" = learns ? "learns" : "unmatched";

  // originTable
  let originTable: { time: string; stopName: string } | null = null;
  if (trip) {
    const firstStopName = resolveFirstStopName(trip, input.snapshot);
    if (firstStopName) {
      try {
        const bt = baseTimeAt(trip, trip.firstPosition);
        if (bt != null) {
          originTable = {
            time: clockText(Math.floor(bt.minute)),
            stopName: firstStopName,
          };
        }
      } catch {
        originTable = null;
      }
    }
  }

  const note =
    boarding.note && boarding.note.trim().length > 0 ? boarding.note.trim() : null;

  const isReviewable =
    reviewQueue(liveObservations).some((o) => o.id === boarding.id) ||
    notVerified(liveObservations).some((o) => o.id === boarding.id);
  const verifyId = isReviewable ? boarding.id : null;

  const deleteKind: "pair" | "single" = alightingModel !== null ? "pair" : "single";

  return {
    line,
    fromName,
    toName,
    dayLabel,
    durationMin,
    ongoing,
    boarding: boardingModel,
    alighting: alightingModel,
    learn,
    originTable,
    note,
    verifyId,
    deleteKind,
  };
}
