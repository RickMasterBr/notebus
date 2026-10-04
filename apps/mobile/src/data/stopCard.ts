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
  type CalendarData,
  type Confidence,
  type DayTypeCode,
  type ExpectedTime,
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
  /** Sem tabela para esse tipo de dia (D-146); só a folha do ponto usa, o cartão do Início mantém o texto de domingo. */
  | { kind: "no_table" }
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
  /** O "esteja no ponto às" já passou e o fim da faixa não: pode passar a qualquer momento (E-02 §4.2, D-146). */
  mayPassNow: boolean;
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

const CLOCK_TEXT_TABLE = Array.from({ length: 1440 }, (_, m) => formatServiceMinute(m));

/** Hora de relógio "HH:MM" de um minuto de serviço (depois da meia-noite: 25:10 → "01:10"). */
export function clockText(serviceMinute: number): string {
  const norm = ((serviceMinute % 1440) + 1440) % 1440;
  return CLOCK_TEXT_TABLE[norm] ?? formatServiceMinute(norm);
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

const stopCardCache = new WeakMap<ScheduleSnapshot, Map<string, StopCard | null>>();

export function buildStopCard(stopId: string, data: ScheduleSnapshot, instantMs: number): StopCard | null {
  const cacheKey = `${stopId}:${instantMs}`;
  let snapCache = stopCardCache.get(data);
  if (!snapCache) {
    snapCache = new Map();
    stopCardCache.set(data, snapCache);
  }
  if (snapCache.has(cacheKey)) return snapCache.get(cacheKey)!;

  const name = data.stopNames.get(stopId);
  if (name === undefined) {
    snapCache.set(cacheKey, null);
    return null; // ponto apagado ou de outra importação
  }

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

  const card: StopCard = { stopId, name, lines };
  snapCache.set(cacheKey, card);
  return card;
}

/** Passagens de embarque da linha neste ponto num dia de serviço (as que terminam aqui ficam de fora). */
function boardablePassages(
  stopId: string,
  date: string,
  dayType: DayTypeCode,
  patterns: PatternData[],
  trips: TripData[],
  schedule: ScheduleData,
  includeEnds = false,
): StopPassage[] {
  const running = new Set(tripsRunningOn(date, dayType, schedule).map((t) => t.id));
  const todays = trips.filter((t) => running.has(t.id));
  const lastOf = new Map<string, number>();
  for (const t of todays) lastOf.set(t.id, t.lastPosition);
  return passagesAtStop(stopId, patterns, todays).filter((p) => includeEnds || p.info.position !== lastOf.get(p.tripId));
}

function lineState(
  stopId: string,
  patterns: PatternData[],
  trips: TripData[],
  data: ScheduleSnapshot,
  instantMs: number,
): Pick<StopCardLine, "destination" | "state"> {
  const { calendar } = data;
  const lineSchedule = lineScheduleOf(trips, data);

  // Hoje e ontem (as viagens depois da meia-noite): o menor "quanto falta" não negativo.
  const { today, yesterday } = serviceDaysAt(instantMs, calendar);
  let best: { passage: StopPassage; wait: number; minute: number } | null = null;
  for (const day of [yesterday, today]) {
    for (const passage of boardablePassages(stopId, day.date, day.dayType.dayType, patterns, trips, lineSchedule)) {
      const wait = passage.expected.center - day.minute;
      if (wait >= 0 && (best === null || wait < best.wait)) best = { passage, wait, minute: day.minute };
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
        mayPassNow: beAtStopPassed(expected, best.minute),
      },
    };
  }

  // Sem mais ônibus hoje, ou sem serviço: o motivo (só se a linha nem circula hoje) e o próximo dia com serviço.
  const clock = lisbonWallClock(instantMs);
  const service = lineServiceOn(clock.date, calendar, lineSchedule);
  const reason = service.status === "none" ? reasonOf(service.reason, clock.date, calendar, lineSchedule, false) : null;
  return nextServiceState(stopId, patterns, trips, data, instantMs, lineSchedule, reason);
}

/** O "esteja no ponto às" (arredondado como na tela, D-092) já ficou para trás no minuto de serviço dado? */
export function beAtStopPassed(expected: ExpectedTime, minute: number): boolean {
  return displayBeAtStop(expected.beAtStop) < minute;
}

/** `ScheduleData` só com as viagens dadas (as de uma linha). */
export function lineScheduleOf(trips: TripData[], data: ScheduleSnapshot): ScheduleData {
  const tripIds = new Set(trips.map((t) => t.id));
  return { ...data.schedule, trips: data.schedule.trips.filter((t) => tripIds.has(t.id)) };
}

/**
 * O próximo dia com serviço da linha neste ponto, a partir de amanhã; nada em 400 dias → `none`. O cartão conta só
 * passagens de embarque; a folha do ponto (`includeEnds`) conta também as que terminam no ponto, porque as lista.
 */
export function nextServiceState(
  stopId: string,
  patterns: PatternData[],
  trips: TripData[],
  data: ScheduleSnapshot,
  instantMs: number,
  lineSchedule: ScheduleData,
  reason: CardReason | null,
  includeEnds = false,
): Pick<StopCardLine, "destination"> & { state: NextDay | NoBus } {
  const clock = lisbonWallClock(instantMs);
  for (let i = 1; i <= NEXT_SERVICE_HORIZON_DAYS; i++) {
    const date = addDays(clock.date, i);
    const passages = boardablePassages(stopId, date, dayTypeOf(date, data.calendar).dayType, patterns, trips, lineSchedule, includeEnds);
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

export function destinationOf(passage: StopPassage, patterns: PatternData[], trips: TripData[], data: ScheduleSnapshot): string | null {
  const trip = trips.find((t) => t.id === passage.tripId);
  const stopId = patterns.find((p) => p.id === passage.patternId)?.stops.find((s) => s.position === trip?.lastPosition)?.stopId;
  return stopId === undefined ? null : (data.stopNames.get(stopId) ?? null);
}

/**
 * O motivo no que a 4.6 tem texto. `forSheet`: a folha do ponto (D-146) tem texto para "sem tabela" (`no_table`);
 * o cartão do Início segue dizendo "domingos e feriados" num domingo e nada num sábado (D-134).
 */
export function reasonOf(
  why: "sem_tabela" | "so_dias_uteis" | "epoca" | "feriado",
  date: string,
  calendar: CalendarData,
  lineSchedule: ScheduleData,
  forSheet: boolean,
): CardReason | null {
  switch (why) {
    case "feriado":
      return { kind: "sunday_holiday" };
    case "so_dias_uteis":
      return { kind: "weekdays_only" };
    case "sem_tabela":
      if (forSheet) return { kind: "no_table" };
      return dayTypeOf(date, calendar).dayType === "sunday_holiday" ? { kind: "sunday_holiday" } : null;
    case "epoca": {
      const dayType = dayTypeOf(date, calendar).dayType;
      const excluding = (inForceOnly: boolean) => {
        const seasonIds = new Set(
          tripsOfDayType(date, dayType, lineSchedule, inForceOnly).flatMap((t) => (t.seasonId === null ? [] : [t.seasonId])),
        );
        return lineSchedule.seasons.find((s) => seasonIds.has(s.id) && s.mode === "exclude");
      };
      // Primeiro as tabelas em vigência; sem nenhuma (antes de 01/09/2026, a vigência da MOBILIS), todas as da linha.
      const found = excluding(true) ?? excluding(false);
      return found ? { kind: "season", months: seasonMonths(found.startMd, found.endMd) } : null;
    }
  }
}

/** As viagens da linha do tipo de dia (e, se `inForceOnly`, em vigência), sem olhar a época (para descobrir qual época as tira). */
function tripsOfDayType(date: string, dayType: DayTypeCode, schedule: ScheduleData, inForceOnly: boolean) {
  const inForce = new Set(
    schedule.timetables.filter((t) => !inForceOnly || (t.validFrom <= date && (t.validTo === null || date <= t.validTo))).map((t) => t.id),
  );
  return schedule.trips.filter((t) => t.deletedAt == null && inForce.has(t.timetableId) && t.dayTypes.includes(dayType));
}
