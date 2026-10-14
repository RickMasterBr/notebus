/**
 * Horário aprendido nas passagens (E-08.5 bloco 10, D-191, A1, A5).
 * Função pura: sem React, sem relógio direto.
 */
import {
  type DayTypeCode,
  type PassageRecord,
  type StopPassage,
  expectedTime,
  serviceDaysAt,
  tripsRunningOn,
} from "@notebus/domain";
import { passageTarget } from "./records";
import type { ScheduleSnapshot } from "./schedule";

export interface LearningContext {
  records: readonly PassageRecord[];
  /** Dia de serviço da passagem e o tipo de dia que vale para ela (o do chip, no Ponto). */
  date: string;
  dayType: DayTypeCode;
  /** Instante (epoch ms) para a recência. */
  now: number;
}

/** A passagem com o horário esperado recalculado com os registros; a mesma passagem, sem copiar, se não há o que somar. */
export function learnedPassage(
  passage: StopPassage,
  data: ScheduleSnapshot,
  ctx: LearningContext,
): StopPassage {
  if (ctx.records.length === 0) return passage;
  const target = passageTarget(data, passage.tripId, passage.info.position, ctx.date, ctx.dayType);
  if (!target) return passage;
  const expected = expectedTime(passage.base, ctx.records, {
    target,
    now: ctx.now,
    marginMinutes: data.margin,
  });
  return { ...passage, expected };
}

/** Aplica `learnedPassage` a cada passagem e reordena por `expected.center` (empate: `base.minute`, depois a ordem de entrada). */
export function learnedPassages(
  passages: readonly StopPassage[],
  data: ScheduleSnapshot,
  ctx: LearningContext,
): StopPassage[] {
  const mapped = passages.map((p) => learnedPassage(p, data, ctx));
  return mapped.sort((a, b) => {
    const diffCenter = a.expected.center - b.expected.center;
    if (diffCenter !== 0) return diffCenter;
    return a.base.minute - b.base.minute;
  });
}

/**
 * Determina o dia de serviço e o tipo de dia de uma viagem para a Daqui para a frente:
 * hoje (serviceDaysAt(instant, data.calendar).today) se a viagem circula nesse dia (tripsRunningOn);
 * senão ontem; senão o primeiro tipo de dia da própria viagem (ScheduleTrip.dayTypes[0]) com a data de hoje.
 * null se a viagem não existe.
 */
export function aheadServiceDay(
  data: ScheduleSnapshot,
  tripId: string,
  instant: number,
): { date: string; dayType: DayTypeCode } | null {
  const trip = data.schedule.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const days = serviceDaysAt(instant, data.calendar);
  const runsToday = tripsRunningOn(days.today.date, days.today.dayType.dayType, data.schedule).some(
    (t) => t.id === tripId,
  );
  if (runsToday) {
    return { date: days.today.date, dayType: days.today.dayType.dayType };
  }

  const runsYesterday = tripsRunningOn(
    days.yesterday.date,
    days.yesterday.dayType.dayType,
    data.schedule,
  ).some((t) => t.id === tripId);
  if (runsYesterday) {
    return { date: days.yesterday.date, dayType: days.yesterday.dayType.dayType };
  }

  const fallbackDayType = trip.dayTypes[0];
  if (!fallbackDayType) return null;
  return { date: days.today.date, dayType: fallbackDayType };
}
