/**
 * Horários em memória (E-02 bloco 3c): tudo o que o domínio precisa para dizer "o próximo ônibus" num ponto,
 * lido do banco **uma vez**, na abertura do app (como a lista de pontos da busca). São centenas de viagens, não milhões.
 * Tudo passa por `selectLive`. Só leitura: nenhuma coluna ou tabela nova.
 */
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { CalendarData, DayTypeCode, PatternData, ScheduleData, TripData } from "@notebus/domain";
import { selectLive } from "../db/query";
import {
  dateOverride, dayType, holiday, line, pattern, patternStop, season, stop, stopTime, timetable, trip, tripDayType,
} from "../db/schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface LineInfo {
  code: string;
  color: string;
}

export interface ScheduleSnapshot {
  calendar: CalendarData;
  schedule: ScheduleData;
  patterns: PatternData[];
  /** Todas as viagens não apagadas, com os horários por posição (`TripData` do domínio). */
  trips: TripData[];
  /** Linha de cada percurso (código e cor do selo). */
  patternLine: Map<string, LineInfo>;
  /** Id da linha de cada percurso (o registro guarda `line_id`; o casamento do domínio compara por ele). */
  patternLineId: Map<string, string>;
  /** Código e cor de cada linha, pelo id (texto do toast e selo do cartão "Em viagem"). */
  lineInfo: Map<string, LineInfo>;
  /** Id do `pattern_stop` de cada posição, na chave `"<percurso>:<posição>"` (a dedução grava `pattern_stop_id`). */
  patternStopIds: Map<string, string>;
  /** O caminho de volta: `pattern_stop_id` → percurso, posição e ponto (para ler a dedução gravada). */
  patternStopById: Map<string, { patternId: string; position: number; stopId: string }>;
  stopNames: Map<string, string>;
}

/** Chave de `ScheduleSnapshot.patternStopIds`. */
export const patternStopKey = (patternId: string, position: number) => `${patternId}:${position}`;

const DAY_TYPE_CODES: readonly string[] = ["weekday", "saturday", "sunday_holiday"];

export async function loadSchedule(db: AnyDb): Promise<ScheduleSnapshot> {
  const [dayTypes, holidays, overrides, seasons, timetables, trips, tripDays, stopTimes, patternStops, patterns, lines, stops] =
    await Promise.all([
      selectLive(db, dayType),
      selectLive(db, holiday),
      selectLive(db, dateOverride),
      selectLive(db, season),
      selectLive(db, timetable),
      selectLive(db, trip),
      selectLive(db, tripDayType),
      selectLive(db, stopTime),
      selectLive(db, patternStop),
      selectLive(db, pattern),
      selectLive(db, line),
      selectLive(db, stop),
    ]);

  const codeOf = new Map<string, DayTypeCode>();
  for (const d of dayTypes) if (DAY_TYPE_CODES.includes(d.code)) codeOf.set(d.id, d.code as DayTypeCode);

  const dayTypesByTrip = new Map<string, DayTypeCode[]>();
  for (const link of tripDays) {
    const code = codeOf.get(link.dayTypeId);
    if (code) dayTypesByTrip.set(link.tripId, [...(dayTypesByTrip.get(link.tripId) ?? []), code]);
  }

  const positionOf = new Map(patternStops.map((p) => [p.id, p.position]));
  const patternOfTimetable = new Map(timetables.map((t) => [t.id, t.patternId]));
  const timesByTrip = new Map<string, TripData["stopTimes"]>();
  for (const st of stopTimes) {
    const position = positionOf.get(st.patternStopId);
    if (position === undefined) continue; // horário de uma posição apagada: não conta
    const list = timesByTrip.get(st.tripId) ?? [];
    list.push({ position, serviceMinute: st.serviceMinute, origin: st.origin });
    timesByTrip.set(st.tripId, list);
  }

  const tripData: TripData[] = [];
  for (const t of trips) {
    const patternId = patternOfTimetable.get(t.timetableId);
    if (patternId === undefined) continue;
    tripData.push({
      id: t.id,
      patternId,
      firstPosition: t.firstPosition,
      lastPosition: t.lastPosition,
      stopTimes: timesByTrip.get(t.id) ?? [],
    });
  }

  const stopsByPattern = new Map<string, PatternData["stops"]>();
  for (const ps of patternStops) {
    const list = stopsByPattern.get(ps.patternId) ?? [];
    list.push({ position: ps.position, stopId: ps.stopId, isTimepoint: ps.isTimepoint });
    stopsByPattern.set(ps.patternId, list);
  }

  const lineById = new Map(lines.map((l) => [l.id, { code: l.code, color: l.color }]));
  const patternLine = new Map<string, LineInfo>();
  const patternLineId = new Map<string, string>();
  for (const p of patterns) {
    const info = lineById.get(p.lineId);
    if (info) {
      patternLine.set(p.id, info);
      patternLineId.set(p.id, p.lineId);
    }
  }

  return {
    calendar: {
      overrides: overrides.flatMap((o) => {
        const code = codeOf.get(o.dayTypeId);
        return code ? [{ date: o.date, dayType: code }] : [];
      }),
      holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    },
    schedule: {
      trips: trips.map((t) => ({
        id: t.id,
        timetableId: t.timetableId,
        dayTypes: dayTypesByTrip.get(t.id) ?? [],
        seasonId: t.seasonId,
        deletedAt: t.deletedAt,
      })),
      timetables: timetables.map((t) => ({ id: t.id, validFrom: t.validFrom, validTo: t.validTo })),
      seasons: seasons.map((s) => ({ id: s.id, startMd: s.startMd, endMd: s.endMd, mode: s.mode })),
    },
    patterns: patterns.map((p) => ({ id: p.id, stops: stopsByPattern.get(p.id) ?? [] })),
    trips: tripData,
    patternLine,
    patternLineId,
    lineInfo: lineById,
    patternStopIds: new Map(patternStops.map((ps) => [patternStopKey(ps.patternId, ps.position), ps.id])),
    patternStopById: new Map(patternStops.map((ps) => [ps.id, { patternId: ps.patternId, position: ps.position, stopId: ps.stopId }])),
    stopNames: new Map(stops.map((s) => [s.id, s.name])),
  };
}
