/**
 * Os registros como a estatística do domínio os lê (E-03 bloco 2): do `observation` gravado (fato + dedução) para o
 * `PassageRecord`, e a rede para o casamento (`MatchNetwork`). Puro: sem banco e sem relógio.
 *
 * Só entra o registro que a dedução ligou a uma passagem (`auto` ou `manual`, D-022): sem viagem, posição e desvio
 * gravados não há o que somar. "Vi passar" e descida contam como o embarque (D-073, Q-81 aberta: a descida entra).
 */
import {
  type MatchNetwork,
  type PassageRecord,
  type PassageTarget,
  dayTypeOf,
} from "@notebus/domain";
import type { ObservationRow } from "./registro";
import type { ScheduleSnapshot } from "./schedule";

const networks = new WeakMap<ScheduleSnapshot, MatchNetwork>();

/** O que o domínio precisa para casar um registro. Uma vez por carga dos horários. */
export function matchNetworkOf(data: ScheduleSnapshot): MatchNetwork {
  const cached = networks.get(data);
  if (cached) return cached;
  const network: MatchNetwork = {
    calendar: data.calendar,
    schedule: data.schedule,
    patterns: data.patterns.flatMap((p) => {
      const lineId = data.patternLineId.get(p.id);
      return lineId === undefined ? [] : [{ ...p, lineId }];
    }),
    trips: data.trips,
  };
  networks.set(data, network);
  return network;
}

/** Os registros aceitos (`auto`/`manual`) já ligados a uma passagem, no formato da estatística. */
export function passageRecords(observations: readonly ObservationRow[], data: ScheduleSnapshot): PassageRecord[] {
  const out: PassageRecord[] = [];
  for (const o of observations) {
    if ((o.matchStatus !== "auto" && o.matchStatus !== "manual") || o.deletedAt != null) continue;
    if (o.tripId === null || o.patternStopId === null || o.deviationMin === null || o.serviceDate === null) continue;
    const at = data.patternStopById.get(o.patternStopId);
    if (!at) continue; // a posição não existe mais (importação trocada): o fato fica, a estatística ignora
    out.push({
      deviation: o.deviationMin,
      observedAt: o.observedAt,
      serviceDate: o.serviceDate,
      dayType: dayTypeOf(o.serviceDate, data.calendar).dayType,
      tripId: o.tripId,
      patternId: at.patternId,
      position: at.position,
      stopId: at.stopId,
      matchStatus: o.matchStatus,
      mode: o.mode,
      kind: o.kind,
    });
  }
  return out;
}

/** A passagem cujo horário esperado se quer: viagem, posição, ponto, tipo do dia e início da vigência da tabela. */
export function passageTarget(data: ScheduleSnapshot, tripId: string, position: number, serviceDate: string): PassageTarget | null {
  const trip = data.trips.find((t) => t.id === tripId);
  const pattern = trip ? data.patterns.find((p) => p.id === trip.patternId) : undefined;
  const stopId = pattern?.stops.find((s) => s.position === position)?.stopId;
  if (!trip || !pattern || stopId === undefined) return null;
  const timetableId = data.schedule.trips.find((t) => t.id === tripId)?.timetableId;
  const validFrom = data.schedule.timetables.find((t) => t.id === timetableId)?.validFrom ?? null;
  return { tripId, patternId: pattern.id, position, stopId, dayType: dayTypeOf(serviceDate, data.calendar).dayType, validFrom };
}
