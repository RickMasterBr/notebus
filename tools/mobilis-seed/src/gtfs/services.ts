/** Os 7 service_id da MOBILIS e as exceções de data (diferença entre o feed e o calendário do app). */
import { addDays, dayOfWeek, dayTypeOf, tripsRunningOn, type ScheduleData } from "@notebus/domain/src/calendar.ts";
import type { DayTypeCode, DaysCode, SeasonRef } from "../types.ts";
import type { GenError, GtfsFeed, SeedHoliday } from "./types.ts";

export interface ServiceRule {
  dayType: DayTypeCode;
  season: SeasonRef | null;
  days: DaysCode;
}

const SUMMER = { startMd: "07-01", endMd: "08-31" };
const rule = (dayType: DayTypeCode, days: DaysCode, mode?: SeasonRef["mode"]): ServiceRule => ({
  dayType,
  days,
  season: mode ? { ...SUMMER, mode } : null,
});

/** Parecer do ADR-0007 §3.1. */
export const SERVICES: Readonly<Record<string, ServiceRule>> = {
  "A-U": rule("weekday", "util"),
  "AX2431-U": rule("weekday", "util"),
  "XJA1-U": rule("weekday", "util", "exclude"),
  "XJA4-U": rule("weekday", "util", "exclude"),
  "JA-U": rule("weekday", "util", "include"),
  "A-S": rule("saturday", "sab"),
  "A-DF": rule("sunday_holiday", "dom-fer"),
};

export type Lookup<T> = { ok: true; value: T } | { ok: false; error: GenError };

export function serviceRule(serviceId: string): Lookup<ServiceRule> {
  const found = Object.hasOwn(SERVICES, serviceId) ? SERVICES[serviceId] : undefined;
  return found
    ? { ok: true, value: found }
    : { ok: false, error: { code: "SERVICO_DESCONHECIDO", message: `service_id fora da tabela: ${serviceId}`, items: [serviceId] } };
}

/** "20261225" → "2026-12-25". */
export const isoDate = (d: string): string => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** Último dia do feed (ISO): `info.fim`, ou o maior `fim` do calendário; `null` se não há nenhum. */
export function feedEnd(feed: GtfsFeed): string | null {
  const ends = feed.info ? [feed.info.fim] : feed.calendario.map((c) => c.fim);
  return ends.length === 0 ? null : isoDate(ends.reduce((a, b) => (a > b ? a : b)));
}

/** O feed diz que o serviço circula nesta data (calendar, depois calendar_dates)? */
function feedRuns(feed: GtfsFeed, serviceId: string, date: string): boolean {
  const flag = (dayOfWeek(date) + 6) % 7; // 0 = segunda
  let runs = feed.calendario.some((c) => c.servico === serviceId && isoDate(c.inicio) <= date && date <= isoDate(c.fim) && c.dias[flag] === "1");
  for (const e of feed.excecoes) {
    if (e.servico === serviceId && isoDate(e.data) === date) runs = e.tipo === "1" ? true : e.tipo === "2" ? false : runs;
  }
  return runs;
}

/**
 * Datas do corte ao fim do feed em que o calendário do app (regra base da tabela, feriados municipais gravados +
 * nacionais da biblioteca) e o feed discordam. `notOn`: o app circula e o feed não; `alsoOn`: o contrário. Crescentes.
 */
export function calendarExceptions(
  feed: GtfsFeed,
  serviceId: string,
  cutoff: string,
  holidays: readonly SeedHoliday[],
): Lookup<{ notOn: string[]; alsoOn: string[] }> {
  const found = serviceRule(serviceId);
  if (!found.ok) return found;
  const { dayType, season } = found.value;
  const data: ScheduleData = {
    trips: [{ id: "t", timetableId: "tt", dayTypes: [dayType], seasonId: season ? "s" : null }],
    timetables: [{ id: "tt", validFrom: cutoff, validTo: null }],
    seasons: season ? [{ id: "s", ...season }] : [],
  };
  const calendar = { overrides: [], holidays: holidays.map((h) => ({ date: h.date, name: h.name })) };
  const notOn: string[] = [];
  const alsoOn: string[] = [];
  const end = feedEnd(feed);
  for (let date = cutoff; end !== null && date <= end; date = addDays(date, 1)) {
    const app = tripsRunningOn(date, dayTypeOf(date, calendar).dayType, data).length > 0;
    const theirs = feedRuns(feed, serviceId, date);
    if (app && !theirs) notOn.push(date);
    else if (!app && theirs) alsoOn.push(date);
  }
  return { ok: true, value: { notOn, alsoOn } };
}
