/**
 * Cálculo de motivo sem serviço e próximo dia para TL-04 (T-50).
 */
import {
  addDays,
  dayTypeOf,
  tripsRunningOn,
  type TripData,
} from "@notebus/domain";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";
import { t } from "../i18n";

export interface NoServiceResult {
  reason: string;
  nextServiceText?: string;
}

const WEEKDAY_KEYS = [
  "common.weekday.0",
  "common.weekday.1",
  "common.weekday.2",
  "common.weekday.3",
  "common.weekday.4",
  "common.weekday.5",
  "common.weekday.6",
] as const;

export function resolveGotoNoService(opts: {
  patternIds: readonly string[];
  tripsToday: readonly TripData[];
  nowMinute: number;
  serviceDate: string;
  schedule: ScheduleSnapshot;
  boardPositions?: Map<string, number>; // patternId -> boardPosition
}): NoServiceResult {
  const { patternIds, tripsToday, nowMinute, serviceDate, schedule, boardPositions } = opts;
  const patternSet = new Set(patternIds);

  // Filtra viagens de hoje que pertencem aos patterns da rota
  const routeTripsToday = tripsToday.filter((t) => patternSet.has(t.patternId));

  let reason = t("sheet_goto.no_service_today");

  if (routeTripsToday.length > 0) {
    // Verifica se alguma viagem ainda vai passar pelo ponto de embarque
    let hasFutureTrip = false;
    for (const trip of routeTripsToday) {
      const pos = boardPositions?.get(trip.patternId) ?? 1;
      const stopTime = trip.stopTimes.find((st) => st.position === pos);
      if (stopTime && stopTime.serviceMinute >= nowMinute) {
        hasFutureTrip = true;
        break;
      }
    }
    if (!hasFutureTrip) {
      reason = t("sheet_goto.no_trips_left");
    }
  }

  // Procura próximo dia com serviço (até 7 dias à frente)
  let nextServiceText: string | undefined;
  for (let offset = 1; offset <= 7; offset++) {
    const nextDate = addDays(serviceDate, offset);
    const { dayType } = dayTypeOf(nextDate, schedule.calendar);
    const runningIds = new Set(
      tripsRunningOn(nextDate, dayType, schedule.schedule).map((t) => t.id),
    );
    const running = schedule.trips.filter(
      (t) => runningIds.has(t.id) && patternSet.has(t.patternId),
    );
    if (running.length > 0) {
      // Pega o menor horário no embarque
      let earliestMin = Infinity;
      for (const trip of running) {
        const pos = boardPositions?.get(trip.patternId) ?? 1;
        const st = trip.stopTimes.find((s) => s.position === pos);
        if (st && st.serviceMinute < earliestMin) {
          earliestMin = st.serviceMinute;
        }
      }
      const dayOfWeekIdx = new Date(`${nextDate}T12:00:00Z`).getUTCDay();
      const weekday = t(WEEKDAY_KEYS[dayOfWeekIdx]!);
      const timeStr = Number.isFinite(earliestMin) ? clockText(earliestMin) : "";
      const dayLabel = timeStr ? `${weekday} às ${timeStr}` : weekday;
      nextServiceText = t("sheet_goto.next_service", { day: dayLabel });
      break;
    }
  }

  return { reason, nextServiceText };
}
