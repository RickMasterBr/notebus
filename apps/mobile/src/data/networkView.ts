/**
 * Lógica pura para exibição da rede e detalhe de linhas (TL-11, E-08 bloco 1c, Item 2).
 * Sem React, "agora" sempre como argumento.
 */
import {
  baseTimeAt,
  type DayTypeCode,
  type PatternData,
  timepointPositions,
  type TripData,
} from "@notebus/domain";
import { t } from "../i18n";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

/**
 * Verdadeiro se a origem é oficial da MOBILIS (D-051); falso para criados pelo usuário.
 */
export function officialTag(source: string): boolean {
  return source === "official" || source === "official_edited";
}

/**
 * Linha de apoio do ponto: apelidos (se houver) e o ID externo (se houver) numa linha só.
 * Retorna null se não houver nenhum.
 */
export function stopSecondary(stop: {
  aliases?: readonly string[] | null;
  externalId?: string | null;
}): string | null {
  const parts: string[] = [];
  if (stop.aliases && stop.aliases.length > 0) {
    parts.push(t("net.stop.aliases", { list: stop.aliases.join(", ") }));
  }
  if (stop.externalId && stop.externalId.trim() !== "") {
    parts.push(t("net.stop.id", { id: stop.externalId.trim() }));
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/**
 * Posições dos pontos de controle do percurso. Embrulha `timepointPositions` do domínio.
 */
export function controlPositions(pattern: PatternData, trips: readonly TripData[]): Set<number> {
  return timepointPositions(pattern, trips);
}

export interface BaseTimesInput {
  snapshot: ScheduleSnapshot;
  patternId: string;
  dayType: DayTypeCode;
  todayLisbon: string;
}

export interface BaseTimesResult {
  stopName: string;
  position: number;
  times: string[];
  partialCount: number;
  validFrom?: string | null;
}

/**
 * Horários-base do percurso no tipo de dia dado.
 * Usa a tabela de horários vigente hoje do percurso (a mesma regra de vigência de `currentValidFrom`).
 * Pega as viagens cujo `dayTypes` inclui o tipo, e devolve as horas de relógio ordenadas pelo minuto de serviço.
 * A viagem depois da meia-noite vem por último, com a hora de relógio (ex.: 25:10 → "01:10").
 */
export function baseTimes({
  snapshot,
  patternId,
  dayType,
  todayLisbon,
}: BaseTimesInput): BaseTimesResult {
  const pattern = snapshot.patterns.find((p) => p.id === patternId);
  if (!pattern || pattern.stops.length === 0) {
    return { stopName: "", position: 0, times: [], partialCount: 0, validFrom: null };
  }

  const patternTrips = snapshot.trips.filter((t) => t.patternId === patternId);
  const cPositions = controlPositions(pattern, patternTrips);

  const sortedStops = [...pattern.stops].sort((a, b) => a.position - b.position);
  const controlStop = sortedStops.find((s) => cPositions.has(s.position)) ?? sortedStops[0];
  if (!controlStop) {
    return { stopName: "", position: 0, times: [], partialCount: 0, validFrom: null };
  }
  const position = controlStop.position;
  const stopName = snapshot.stopNames.get(controlStop.stopId) ?? "";

  const scheduleTripMap = new Map(snapshot.schedule.trips.map((st) => [st.id, st]));
  const timetableIds = new Set(
    patternTrips.map((t) => scheduleTripMap.get(t.id)?.timetableId).filter((id): id is string => Boolean(id)),
  );
  const patternTimetables = snapshot.schedule.timetables.filter(
    (tt) => timetableIds.has(tt.id) || (tt as { patternId?: string }).patternId === patternId,
  );

  const inForce = patternTimetables.filter(
    (tt) => tt.validFrom <= todayLisbon && (tt.validTo === null || tt.validTo >= todayLisbon),
  );
  const pool = inForce.length > 0 ? inForce : patternTimetables;
  const active = [...pool].sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
  const validFrom = active?.validFrom ?? null;

  if (!active) {
    return { stopName, position, times: [], partialCount: 0, validFrom: null };
  }

  const activeTrips = patternTrips.filter((t) => scheduleTripMap.get(t.id)?.timetableId === active.id);
  const runningTrips = activeTrips.filter((t) => {
    const st = scheduleTripMap.get(t.id);
    return st && st.deletedAt == null && st.dayTypes.includes(dayType);
  });

  if (runningTrips.length === 0) {
    return { stopName, position, times: [], partialCount: 0, validFrom };
  }

  const validMinutes: number[] = [];
  let partialCount = 0;

  for (const trip of runningTrips) {
    let minute: number | null = null;
    const direct = trip.stopTimes.find((s) => s.position === position);
    if (direct) {
      minute = direct.serviceMinute;
    } else if (position >= trip.firstPosition && position <= trip.lastPosition) {
      try {
        const bt = baseTimeAt(trip, position);
        if (bt) minute = bt.minute;
      } catch {
        minute = null;
      }
    }

    if (minute !== null) {
      validMinutes.push(minute);
    } else {
      partialCount++;
    }
  }

  validMinutes.sort((a, b) => a - b);
  const times = validMinutes.map((m) => clockText(Math.round(m)));

  return { stopName, position, times, partialCount, validFrom };
}
