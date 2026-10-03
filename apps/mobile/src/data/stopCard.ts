/**
 * Dados do cartão de ponto da TL-01 (E-02 bloco 3c; 4.1 §4 e §11, 4.4, canvas da 4.5): por linha que serve o ponto,
 * o próximo ônibus com a faixa e o "esteja no ponto às"; ou, sem mais ônibus, o próximo dia com serviço.
 * Puro: recebe o instante (do `NowProvider`) e os horários em memória; tudo o que é conta vem do domínio.
 *
 * "Próximo" = a primeira passagem cujo **centro** ainda não passou (E-02 §4.2). A passagem que já passou do centro
 * mas ainda cabe na faixa ("pode passar a qualquer momento") é do bloco 4: aqui ela não aparece.
 * Passagem que **termina** neste ponto (última posição da viagem) não serve para embarcar: fica de fora.
 */
import {
  addDays,
  dayOfWeek,
  dayTypeOf,
  displayBeAtStop,
  displayCenter,
  formatServiceMinute,
  lineServiceOn,
  lisbonWallClock,
  passagesAtStop,
  serviceDaysAt,
  tripsRunningOn,
  type Confidence,
  type DayTypeCode,
  type PatternData,
  type ScheduleData,
  type StopPassage,
  type TripData,
} from "@notebus/domain";
import type { ScheduleSnapshot } from "./schedule";

/** Até onde procurar o próximo dia com serviço (como o domínio: cobre qualquer época anual). */
const NEXT_SERVICE_HORIZON_DAYS = 400;

/** Por que a linha não circula hoje, já no que a 4.6 tem texto (`sheet_stop.no_service.*`). */
export type CardReason =
  | { kind: "sunday_holiday" }
  | { kind: "weekdays_only" }
  /** Meses (1–12) em que não circula, na ordem do calendário ("julho e agosto" = [7, 8]). */
  | { kind: "season"; months: number[] };

export interface NextBus {
  status: "next";
  /** Horas de relógio "HH:MM" (D-092: centro ao minuto mais próximo, "esteja no ponto" sempre para baixo). */
  time: string;
  rangeStart: string;
  rangeEnd: string;
  beAtStop: string;
  confidence: Confidence;
}

export interface NextDay {
  status: "later";
  /** Só quando a linha nem circula hoje; `null` quando só acabaram os ônibus de hoje (ou a 4.6 não tem texto). */
  reason: CardReason | null;
  /** Data (AAAA-MM-DD), dia da semana (0 = domingo) e hora do primeiro ônibus desse dia. */
  date: string;
  weekday: number;
  time: string;
}

/** Nenhum ônibus nos próximos 400 dias (ex.: linha sem passagem de embarque neste ponto). */
export interface NoBus {
  status: "none";
  reason: CardReason | null;
}

export interface StopCardLine {
  code: string;
  color: string;
  /** Nome do último ponto da viagem do próximo ônibus ("→ Estação"); `null` se não achar. */
  destination: string | null;
  state: NextBus | NextDay | NoBus;
}

export interface StopCard {
  stopId: string;
  name: string;
  lines: StopCardLine[];
}

/** Hora de relógio "HH:MM" de um minuto de serviço (depois da meia-noite: 25:10 → "01:10"). */
export function clockText(serviceMinute: number): string {
  return formatServiceMinute(((serviceMinute % 1440) + 1440) % 1440);
}

/** Meses (1–12) de um intervalo anual "MM-DD"…"MM-DD", com virada de ano ("12-15"…"01-15" = [12, 1]). */
export function seasonMonths(startMd: string, endMd: string): number[] {
  const start = Number(startMd.slice(0, 2));
  const end = Number(endMd.slice(0, 2));
  const months: number[] = [];
  for (let m = start; ; m = (m % 12) + 1) {
    months.push(m);
    if (m === end) break;
  }
  return months;
}

export function buildStopCard(stopId: string, data: ScheduleSnapshot, instantMs: number): StopCard | null {
  const name = data.stopNames.get(stopId);
  if (name === undefined) return null; // ponto apagado ou de outra importação

  // Percursos que passam no ponto, agrupados por linha.
  const byLine = new Map<string, { color: string; patterns: PatternData[] }>();
  for (const p of data.patterns) {
    if (!p.stops.some((s) => s.stopId === stopId)) continue;
    const info = data.patternLine.get(p.id);
    if (!info) continue;
    const entry = byLine.get(info.code) ?? { color: info.color, patterns: [] };
    entry.patterns.push(p);
    byLine.set(info.code, entry);
  }

  const lines: StopCardLine[] = [...byLine.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt", { numeric: true }))
    .map(([code, { color, patterns }]) => {
      const patternIds = new Set(patterns.map((p) => p.id));
      const trips = data.trips.filter((t) => patternIds.has(t.patternId));
      return { code, color, ...lineState(stopId, patterns, trips, data, instantMs) };
    });

  return { stopId, name, lines };
}

/** Passagens de embarque da linha neste ponto num dia de serviço (as que terminam aqui ficam de fora). */
function boardablePassages(
  stopId: string,
  date: string,
  dayType: DayTypeCode,
  patterns: PatternData[],
  trips: TripData[],
  schedule: ScheduleData,
): StopPassage[] {
  const running = new Set(tripsRunningOn(date, dayType, schedule).map((t) => t.id));
  const todays = trips.filter((t) => running.has(t.id));
  const lastOf = new Map(todays.map((t) => [t.id, t.lastPosition]));
  return passagesAtStop(stopId, patterns, todays).filter((p) => p.info.position !== lastOf.get(p.tripId));
}

function lineState(
  stopId: string,
  patterns: PatternData[],
  trips: TripData[],
  data: ScheduleSnapshot,
  instantMs: number,
): Pick<StopCardLine, "destination" | "state"> {
  const { calendar } = data;
  const tripIds = new Set(trips.map((t) => t.id));
  const lineSchedule: ScheduleData = { ...data.schedule, trips: data.schedule.trips.filter((t) => tripIds.has(t.id)) };

  // Hoje e ontem (as viagens depois da meia-noite): o menor "quanto falta" não negativo.
  const { today, yesterday } = serviceDaysAt(instantMs, calendar);
  let best: { passage: StopPassage; wait: number } | null = null;
  for (const day of [yesterday, today]) {
    for (const passage of boardablePassages(stopId, day.date, day.dayType.dayType, patterns, trips, lineSchedule)) {
      const wait = passage.expected.center - day.minute;
      if (wait >= 0 && (best === null || wait < best.wait)) best = { passage, wait };
    }
  }
  if (best) {
    const { passage } = best;
    const { expected } = passage;
    return {
      destination: destinationOf(passage, patterns, trips, data),
      state: {
        status: "next",
        time: clockText(displayCenter(expected.center)),
        rangeStart: clockText(displayCenter(expected.rangeStart)),
        rangeEnd: clockText(displayCenter(expected.rangeEnd)),
        beAtStop: clockText(displayBeAtStop(expected.beAtStop)),
        confidence: expected.confidence,
      },
    };
  }

  // Sem mais ônibus hoje, ou sem serviço: o motivo (só se a linha nem circula hoje) e o próximo dia com serviço.
  const clock = lisbonWallClock(instantMs);
  const service = lineServiceOn(clock.date, calendar, lineSchedule);
  const reason = service.status === "none" ? reasonOf(service.reason, clock.date, data, lineSchedule) : null;
  for (let i = 1; i <= NEXT_SERVICE_HORIZON_DAYS; i++) {
    const date = addDays(clock.date, i);
    const passages = boardablePassages(stopId, date, dayTypeOf(date, calendar).dayType, patterns, trips, lineSchedule);
    const first = passages[0];
    if (first) {
      return {
        destination: destinationOf(first, patterns, trips, data),
        state: { status: "later", reason, date, weekday: dayOfWeek(date), time: clockText(displayCenter(first.expected.center)) },
      };
    }
  }
  return { destination: null, state: { status: "none", reason } };
}

function destinationOf(passage: StopPassage, patterns: PatternData[], trips: TripData[], data: ScheduleSnapshot): string | null {
  const trip = trips.find((t) => t.id === passage.tripId);
  const stopId = patterns.find((p) => p.id === passage.patternId)?.stops.find((s) => s.position === trip?.lastPosition)?.stopId;
  return stopId === undefined ? null : (data.stopNames.get(stopId) ?? null);
}

function reasonOf(
  why: "sem_tabela" | "so_dias_uteis" | "epoca" | "feriado",
  date: string,
  data: ScheduleSnapshot,
  lineSchedule: ScheduleData,
): CardReason | null {
  switch (why) {
    case "feriado":
      return { kind: "sunday_holiday" };
    case "so_dias_uteis":
      return { kind: "weekdays_only" };
    case "sem_tabela":
      // A 4.6 só tem texto para domingo/feriado; num sábado sem tabela não há frase aprovada.
      return dayTypeOf(date, data.calendar).dayType === "sunday_holiday" ? { kind: "sunday_holiday" } : null;
    case "epoca": {
      const dayType = dayTypeOf(date, data.calendar).dayType;
      const seasonIds = new Set(
        tripsRunningOnIgnoringSeason(date, dayType, lineSchedule).flatMap((t) => (t.seasonId === null ? [] : [t.seasonId])),
      );
      const found = lineSchedule.seasons.find((s) => seasonIds.has(s.id) && s.mode === "exclude");
      return found ? { kind: "season", months: seasonMonths(found.startMd, found.endMd) } : null;
    }
  }
}

/** As viagens da linha do tipo de dia e em vigência, sem olhar a época (para descobrir qual época as tira). */
function tripsRunningOnIgnoringSeason(date: string, dayType: DayTypeCode, schedule: ScheduleData) {
  const inForce = new Set(
    schedule.timetables.filter((t) => t.validFrom <= date && (t.validTo === null || date <= t.validTo)).map((t) => t.id),
  );
  return schedule.trips.filter((t) => t.deletedAt == null && inForce.has(t.timetableId) && t.dayTypes.includes(dayType));
}
