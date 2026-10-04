/**
 * Rede INVENTADA para os testes da E-03 (D-091): três linhas curtas com a forma dos casos da Fase 1 §10.
 * Nomes, IDs, posições e horários não são os da MOBILIS; só reproduzem as regras.
 *
 * - L1 (percurso de 10 posições): pontos de controle 1, 6 e 10; dia útil de 30 em 30 min (06:40…19:40 e uma
 *   "00:10" = 24:10, D-016), sábado de hora em hora (07:40…19:40). Partida s → pos. 6 às s+10 → pos. 10 às s+20,
 *   então a Arrabalde (pos. 2) é sempre s+2, interpolado.
 * - L2 (25 posições): controle 1, 21 (Campus) e 25; dia útil de 30 em 30 (06:50…19:50), sábado de hora em hora
 *   (07:50…19:50). Partida s → Campus s+40 → pos. 25 s+46, então a F. R. Lobo (pos. 23) é s+43, interpolado.
 * - L3 (3 posições): controle 1 e 3; dia útil de hora em hora (07:05…19:05). Partida s → pos. 3 s+3, então a
 *   Arrabalde (pos. 2, o mesmo ponto físico da L1) é s+1,5.
 */
import type { CalendarData, ScheduleData, ScheduleTrip } from "../calendar.ts";
import type { LinePatternData, MatchNetwork } from "../matching.ts";
import type { TripData } from "../passages.ts";
import type { DayTypeCode } from "../seedFormat.ts";

export const ARRABALDE = "f-arrabalde";
export const CAMPUS = "f-campus";
export const LOBO = "f-lobo";
export const VALID_FROM = "2026-09-01";

export const hm = (h: number, m: number) => h * 60 + m;

/** Instante do relógio de parede de Lisboa (as datas destes testes estão no horário de verão, UTC+1, até 25/10/2026). */
export function at(date: string, hh: number, mm: number, ss = 0): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y!, mo! - 1, d!, hh - 1, mm, ss);
}

const pattern = (id: string, lineId: string, n: number, timepoints: number[], stopAt: (p: number) => string): LinePatternData => ({
  id,
  lineId,
  stops: Array.from({ length: n }, (_, i) => ({ position: i + 1, stopId: stopAt(i + 1), isTimepoint: timepoints.includes(i + 1) })),
});

export const P1 = pattern("f-pat-l1", "f-l1", 10, [1, 6, 10], (p) => (p === 2 ? ARRABALDE : `f-l1-${p}`));
export const P2 = pattern("f-pat-l2", "f-l2", 25, [1, 21, 25], (p) => (p === 21 ? CAMPUS : p === 23 ? LOBO : `f-l2-${p}`));
export const P3 = pattern("f-pat-l3", "f-l3", 3, [1, 3], (p) => (p === 2 ? ARRABALDE : `f-l3-${p}`));

const trips: TripData[] = [];
const scheduleTrips: ScheduleTrip[] = [];

function addTrips(p: LinePatternData, dayType: DayTypeCode, starts: number[], offsets: [number, number][]): void {
  for (const s of starts) {
    const id = tripId(p, dayType, s);
    trips.push({
      id,
      patternId: p.id,
      firstPosition: 1,
      lastPosition: p.stops.length,
      stopTimes: offsets.map(([position, off]) => ({ position, serviceMinute: s + off, origin: "official" as const })),
    });
    scheduleTrips.push({ id, timetableId: `tt-${p.id}`, dayTypes: [dayType], seasonId: null });
  }
}

/** ID da viagem inventada: `f-pat-l1/weekday/0810`. */
export function tripId(p: LinePatternData, dayType: DayTypeCode, start: number): string {
  const h = Math.floor(start / 60);
  const m = start % 60;
  return `${p.id}/${dayType}/${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

const every = (from: number, to: number, step: number) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);

addTrips(P1, "weekday", [...every(hm(6, 40), hm(19, 40), 30), hm(24, 10)], [[1, 0], [6, 10], [10, 20]]);
addTrips(P1, "saturday", every(hm(7, 40), hm(19, 40), 60), [[1, 0], [6, 10], [10, 20]]);
addTrips(P2, "weekday", every(hm(6, 50), hm(19, 50), 30), [[1, 0], [21, 40], [25, 46]]);
addTrips(P2, "saturday", every(hm(7, 50), hm(19, 50), 60), [[1, 0], [21, 40], [25, 46]]);
addTrips(P3, "weekday", every(hm(7, 5), hm(19, 5), 60), [[1, 0], [3, 3]]);

export const TRIPS: readonly TripData[] = trips;

const calendar: CalendarData = { overrides: [], holidays: [] };
const schedule: ScheduleData = {
  trips: scheduleTrips,
  timetables: [P1, P2, P3].map((p) => ({ id: `tt-${p.id}`, validFrom: VALID_FROM, validTo: null })),
  seasons: [],
};

export const NETWORK: MatchNetwork = { calendar, schedule, patterns: [P1, P2, P3], trips };

export const trip = (id: string): TripData => trips.find((t) => t.id === id)!;
