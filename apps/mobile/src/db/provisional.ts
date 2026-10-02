/**
 * Consultas da lista provisória (E-01 bloco 4b): linhas → percursos → viagens → horários de uma viagem.
 * Só serve para conferir a importação contra o site da MOBILIS; a E-02 joga fora e faz as telas de verdade.
 * Tudo passa por `selectLive` (sem exclusão lógica).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { DayTypeCode } from "@notebus/domain";
import { selectLive } from "./query";
import { dayType, line, pattern, patternStop, stop, stopTime, timetable, trip, tripDayType } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface LineItem { id: string; code: string; name: string; color: string }
export interface PatternItem { id: string; label: string }
export interface TripItem { id: string; firstMinute: number; dayTypes: DayTypeCode[] }
export interface TripTime { position: number; stopName: string; minute: number }

export async function listLines(db: AnyDb): Promise<LineItem[]> {
  const rows = await selectLive(db, line);
  return rows
    .map(({ id, code, name, color }) => ({ id, code, name, color }))
    .sort((a, b) => a.code.localeCompare(b.code, "pt", { numeric: true }));
}

export async function listPatterns(db: AnyDb, lineId: string): Promise<PatternItem[]> {
  const rows = await selectLive(db, pattern, eq(pattern.lineId, lineId));
  return rows.map(({ id, label }) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "pt"));
}

/** Viagens do quadro em vigor (`valid_to` vazio) do percurso, pela hora da primeira paragem. */
export async function listTrips(db: AnyDb, patternId: string): Promise<TripItem[]> {
  const tables = await selectLive(db, timetable, and(eq(timetable.patternId, patternId), isNull(timetable.validTo)));
  if (tables.length === 0) return [];
  const trips = await selectLive(db, trip, inArray(trip.timetableId, tables.map((t) => t.id)));
  if (trips.length === 0) return [];
  const tripIds = trips.map((t) => t.id);

  const starts = await db
    .select({ tripId: stopTime.tripId, position: patternStop.position, minute: stopTime.serviceMinute })
    .from(stopTime)
    .innerJoin(patternStop, eq(patternStop.id, stopTime.patternStopId))
    .where(and(isNull(stopTime.deletedAt), inArray(stopTime.tripId, tripIds)));
  const days = await db
    .select({ tripId: tripDayType.tripId, code: dayType.code })
    .from(tripDayType)
    .innerJoin(dayType, eq(dayType.id, tripDayType.dayTypeId))
    .where(and(isNull(tripDayType.deletedAt), inArray(tripDayType.tripId, tripIds)));

  return trips
    .flatMap((t) => {
      const first = starts.find((s) => s.tripId === t.id && s.position === t.firstPosition);
      if (!first) return [];
      return [{ id: t.id, firstMinute: first.minute, dayTypes: days.filter((d) => d.tripId === t.id).map((d) => d.code as DayTypeCode) }];
    })
    .sort((a, b) => a.firstMinute - b.firstMinute);
}

/** Paragem e horário de cada passagem da viagem, na ordem do percurso. */
export async function listTripTimes(db: AnyDb, tripId: string): Promise<TripTime[]> {
  const rows = await db
    .select({ position: patternStop.position, stopName: stop.name, minute: stopTime.serviceMinute })
    .from(stopTime)
    .innerJoin(patternStop, eq(patternStop.id, stopTime.patternStopId))
    .innerJoin(stop, eq(stop.id, patternStop.stopId))
    .where(and(isNull(stopTime.deletedAt), eq(stopTime.tripId, tripId)));
  return rows.sort((a, b) => a.position - b.position);
}
