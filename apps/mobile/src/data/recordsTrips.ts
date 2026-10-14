/**
 * Decisões puras para a lista de Registros por viagem (E-08.5 Bloco 16, D-207).
 * Puro: sem React, sem banco, sem relógio.
 */
import { notVerified } from "./review";
import type { ObservationRow, RideRow } from "./registro";
import {
  buildRecordsList,
  formatRowTime,
  type RecordListRow,
  type RecordsSnapshotDeps,
} from "./recordsList";
import { t } from "../i18n";
import { colors } from "../theme/tokens";

export interface TripCardModel {
  kind: "trip";
  boardingId: string;
  alightingId: string | null;
  line: {
    code: string;
    color: string;
  };
  fromName: string;
  toName: string | null;
  timeText: string;
  durationMin: number | null;
  deltaText: string | null;
  verifyState: "pending" | "notVerified" | null;
  noAlight: boolean;
  ongoing: boolean;
  a11y: string;
}

export interface LineItemModel {
  kind: "passed" | "alighted_alone";
  id: string;
  row: RecordListRow;
}

export type TripListItem = TripCardModel | LineItemModel;

export interface TripDayGroup {
  serviceDate: string;
  label: string;
  items: TripListItem[];
}

export interface TripsListModel {
  now: TripCardModel | null;
  pending: RecordListRow[];
  allChecked: boolean;
  days: TripDayGroup[];
  hasMore: boolean;
  windowDays: number;
}

export function calcDurationMin(
  boarding: ObservationRow,
  alighting: ObservationRow | null | undefined,
): number | null {
  if (!alighting) return null;
  if (boarding.observedEndAt != null || alighting.observedEndAt != null) return null;
  const diff = Math.round((alighting.observedAt - boarding.observedAt) / 60000);
  return diff >= 0 ? diff : null;
}

export function formatTripTimeText(
  boarding: ObservationRow,
  alighting: ObservationRow | null | undefined,
  ongoing: boolean,
  durationMin: number | null,
): string {
  if (alighting) {
    const range = t("sheet_records.trip.time_range", {
      start: formatRowTime(boarding),
      end: formatRowTime(alighting),
    });
    if (durationMin !== null) {
      return t("sheet_records.trip.time_line", {
        range,
        duration: t("sheet_records.trip.duration", { n: durationMin }),
      });
    }
    return range;
  }
  if (ongoing) {
    return t("sheet_records.trip.time_open", { time: formatRowTime(boarding) });
  }
  return formatRowTime(boarding);
}

export function calcTripDeltaText(boarding: ObservationRow): string | null {
  if (
    (boarding.matchStatus === "auto" || boarding.matchStatus === "manual") &&
    boarding.deviationMin !== null
  ) {
    const raw = Math.round(boarding.deviationMin);
    const n = Math.abs(raw);
    const deltaKey =
      raw > 0 ? "why.delta.late" : raw < 0 ? "why.delta.early" : "why.delta.on_time";
    return t("sheet_records.trip.delta", { delta: t(deltaKey, { n }) });
  }
  return null;
}

export function resolveTripLine(
  lineId: string,
  snapshot: RecordsSnapshotDeps | null,
): { code: string; color: string } {
  const lineInfo = snapshot?.lineInfo?.get(lineId);
  return {
    code: lineInfo?.code ?? lineId,
    color: lineInfo?.color ?? colors.light.textSecondary,
  };
}

export function resolveStopName(
  stopId: string,
  snapshot: RecordsSnapshotDeps | null,
): string {
  return snapshot?.stopNames?.get(stopId) ?? stopId;
}

export function formatTripA11y(
  lineCode: string,
  fromName: string,
  toName: string | null,
  timeText: string,
  verifyState: "pending" | "notVerified" | null,
): string {
  const route =
    toName != null
      ? t("sheet_records.trip.route", { from: fromName, to: toName })
      : t("sheet_records.trip.route_unknown", { from: fromName });
  const state =
    verifyState === "pending"
      ? t("sheet_records.row.state_pending")
      : verifyState === "notVerified"
        ? t("sheet_records.row.state_not_verified")
        : "";
  return t("sheet_records.trip.a11y", {
    line: lineCode,
    route,
    time: timeText,
    state,
  });
}

export function createTripCardModel(
  boarding: ObservationRow,
  ride: RideRow | undefined,
  liveObsMap: Map<string, ObservationRow>,
  snapshot: RecordsSnapshotDeps | null,
  verifyState: "pending" | "notVerified" | null,
): TripCardModel {
  const alightingObs =
    ride && ride.alightingObservationId
      ? (liveObsMap.get(ride.alightingObservationId) ?? null)
      : null;
  const alightingId = alightingObs ? alightingObs.id : null;
  const ongoing = !!(ride && ride.status === "open");
  const noAlight = alightingId === null && !ongoing;
  const line = resolveTripLine(boarding.lineId, snapshot);
  const fromName = resolveStopName(boarding.stopId, snapshot);
  const toName = alightingObs ? resolveStopName(alightingObs.stopId, snapshot) : null;
  const durationMin = calcDurationMin(boarding, alightingObs);
  const timeText = formatTripTimeText(boarding, alightingObs, ongoing, durationMin);
  const deltaText = calcTripDeltaText(boarding);
  const a11y = formatTripA11y(line.code, fromName, toName, timeText, verifyState);

  return {
    kind: "trip",
    boardingId: boarding.id,
    alightingId,
    line,
    fromName,
    toName,
    timeText,
    durationMin,
    deltaText,
    verifyState,
    noAlight,
    ongoing,
    a11y,
  };
}

export function buildTripsList(input: {
  observations: readonly ObservationRow[];
  rides: readonly RideRow[];
  snapshot: RecordsSnapshotDeps | null;
  now: number;
  windowDays?: number;
}): TripsListModel {
  const windowDays = input.windowDays ?? 14;
  const listModel = buildRecordsList(input.observations, input.snapshot, input.now, windowDays);

  const liveObsMap = new Map<string, ObservationRow>();
  for (const obs of input.observations) {
    if (obs.deletedAt == null) {
      liveObsMap.set(obs.id, obs);
    }
  }

  const rideByBoardingId = new Map<string, RideRow>();
  const rideById = new Map<string, RideRow>();
  for (const r of input.rides) {
    if (r.deletedAt == null) {
      rideById.set(r.id, r);
      rideByBoardingId.set(r.boardingObservationId, r);
    }
  }

  const hasRideForAlighting = (obs: ObservationRow): boolean => {
    return input.rides.some(
      (r) =>
        r.deletedAt == null &&
        (r.alightingObservationId === obs.id || (obs.rideId != null && r.id === obs.rideId)),
    );
  };

  const pendingIds = new Set(listModel.pending.map((r) => r.id));
  const dismissedObs = notVerified(Array.from(liveObsMap.values()));
  const dismissedIds = new Set(dismissedObs.map((o) => o.id));
  const verifyStateOf = (id: string): "pending" | "notVerified" | null => {
    if (pendingIds.has(id)) return "pending";
    if (dismissedIds.has(id)) return "notVerified";
    return null;
  };

  const openRidesWithLiveBoarding: { ride: RideRow; boarding: ObservationRow }[] = [];
  for (const r of input.rides) {
    if (r.deletedAt == null && r.status === "open") {
      const boarding = liveObsMap.get(r.boardingObservationId);
      if (boarding) {
        openRidesWithLiveBoarding.push({ ride: r, boarding });
      }
    }
  }
  openRidesWithLiveBoarding.sort((a, b) => b.boarding.observedAt - a.boarding.observedAt);
  const nowCard =
    openRidesWithLiveBoarding.length > 0
      ? createTripCardModel(
          openRidesWithLiveBoarding[0]!.boarding,
          openRidesWithLiveBoarding[0]!.ride,
          liveObsMap,
          input.snapshot,
          verifyStateOf(openRidesWithLiveBoarding[0]!.boarding.id),
        )
      : null;

  const days: TripDayGroup[] = [];
  for (const day of listModel.days) {
    const items: TripListItem[] = [];
    for (const row of day.rows) {
      if (row.kind === "boarded") {
        if (nowCard && row.id === nowCard.boardingId) {
          continue;
        }
        const ride =
          rideByBoardingId.get(row.id) ??
          (row.observation.rideId ? rideById.get(row.observation.rideId) : undefined);
        const card = createTripCardModel(
          row.observation,
          ride,
          liveObsMap,
          input.snapshot,
          row.verifyState,
        );
        items.push(card);
      } else if (row.kind === "passed") {
        items.push({
          kind: "passed",
          id: row.id,
          row,
        });
      } else if (row.kind === "alighted") {
        if (!hasRideForAlighting(row.observation)) {
          items.push({
            kind: "alighted_alone",
            id: row.id,
            row,
          });
        }
      }
    }

    if (items.length > 0) {
      days.push({
        serviceDate: day.serviceDate,
        label: day.label,
        items,
      });
    }
  }

  const allChecked = listModel.pending.length === 0 && (nowCard !== null || days.length > 0);

  return {
    now: nowCard,
    pending: listModel.pending,
    allChecked,
    days,
    hasMore: listModel.hasMore,
    windowDays: listModel.windowDays,
  };
}
