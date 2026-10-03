/**
 * Dados da folha do ponto, TL-02 (E-02 bloco 4; plano §3 e §4.2, 4.1 §5 e §11): por linha, as passagens do dia neste
 * ponto, cada uma com horário, faixa, "esteja no ponto às", confiança, número, origem e destino (D-094), a marcação
 * de "próximo" e a de "pode passar a qualquer momento". Puro: recebe o instante (do `NowProvider`) e os horários em
 * memória; as contas (tipo de dia, dia de serviço, horário-base, arredondamento) são do domínio e de `stopCard.ts`.
 *
 * Dois modos, pelo tipo de dia pedido:
 * - **o de hoje** (padrão): olha o dia de serviço de hoje e o de ontem (as viagens depois da meia-noite) e lista só as
 *   passagens cujo **fim da faixa** ainda não passou; o "próximo" é a primeira cujo **centro** ainda não passou e que
 *   dá para embarcar;
 * - **outro tipo de dia**: o dia de serviço inteiro daquele tipo, mas com a época e a vigência de **hoje** (§4.2).
 *   Nada de "próximo" nem de "pode passar": não é agora.
 *
 * Passagem que **termina** neste ponto (última posição da viagem) aparece, marcada, mas nunca é o "próximo".
 */
import {
  type CalendarData,
  type Confidence,
  type DayTypeCode,
  type PatternData,
  type StopPassage,
  type TripData,
  baseTimeAt,
  dayTypeOf,
  displayBeAtStop,
  displayCenter,
  lineServiceOn,
  lisbonWallClock,
  passagesAtStop,
  serviceDaysAt,
  tripsRunningOn,
} from "@notebus/domain";
import type { ScheduleSnapshot } from "./schedule";
import {
  type CardReason,
  type NextDay,
  beAtStopPassed,
  clockText,
  lineScheduleOf,
  nextServiceState,
  reasonOf,
} from "./stopCard";

export interface PassageRow {
  /** Chave estável da linha da lista: dia de serviço + viagem + posição. */
  key: string;
  tripId: string;
  position: number;
  /** Horas de relógio "HH:MM" (D-092: centro e faixa ao minuto mais próximo, "esteja no ponto" para baixo). */
  time: string;
  rangeStart: string;
  rangeEnd: string;
  beAtStop: string;
  confidence: Confidence;
  /** 1ª, 2ª, 3ª vez deste ponto físico no percurso; `null` se o percurso passa aqui uma vez só (§3.6). */
  number: number | null;
  /** Nome do ponto de controle anterior; `null` na primeira posição da viagem (D-094). */
  origin: string | null;
  /** Próximo ponto de controle e a que horas a viagem passa lá; `null` na última posição da viagem. */
  destination: { name: string; time: string } | null;
  /** Último ponto da viagem ("→ Estação", D-134); `null` se não achar. */
  tripDestination: string | null;
  /** A viagem começa aqui / termina aqui (não dá para embarcar). */
  isFirst: boolean;
  isLast: boolean;
  /** A primeira da linha cujo centro ainda não passou e que dá para embarcar (só no modo "hoje"). */
  isNext: boolean;
  /** O "esteja no ponto às" já passou, o fim da faixa não (só no modo "hoje"; mostra `rangeEnd`). */
  mayPassNow: boolean;
}

export interface DayLineEmpty {
  /** Por que a linha não circula; `null` quando circula mas já acabou ou não passa aqui. */
  reason: CardReason | null;
  /** O próximo dia com serviço neste ponto (a partir de amanhã); `null` se não há em 400 dias. */
  next: Pick<NextDay, "date" | "weekday" | "time"> | null;
}

export interface DayLine {
  code: string;
  color: string;
  /** Último ponto da viagem do "próximo" (ou da primeira da lista); `null` se não achar. */
  destination: string | null;
  /** Todas as passagens da linha neste ponto são o fim do percurso (cabeçalho "(fim do percurso)"). */
  endsHere: boolean;
  rows: PassageRow[];
  /** Presente quando `rows` está vazio: nunca uma lista vazia sem explicação (4.1 §11). */
  empty: DayLineEmpty | null;
}

export interface StopDay {
  stopId: string;
  name: string;
  /** O tipo de dia mostrado e o de hoje (o chip "Hoje" é o do tipo de hoje). */
  dayType: DayTypeCode;
  todayType: DayTypeCode;
  lines: DayLine[];
}

interface Candidate {
  date: string;
  /** Minuto de serviço de "agora" nesse dia de serviço; `null` fora do modo "hoje". */
  now: number | null;
  passage: StopPassage;
  trip: TripData;
}

export function buildStopDay(stopId: string, data: ScheduleSnapshot, instantMs: number, dayType?: DayTypeCode): StopDay | null {
  const name = data.stopNames.get(stopId);
  if (name === undefined) return null; // ponto apagado ou de outra importação

  const clock = lisbonWallClock(instantMs);
  const todayType = dayTypeOf(clock.date, data.calendar).dayType;
  const shown = dayType ?? todayType;

  const byLine = new Map<string, { color: string; patterns: PatternData[] }>();
  for (const p of data.patterns) {
    if (!p.stops.some((s) => s.stopId === stopId)) continue;
    const info = data.patternLine.get(p.id);
    if (!info) continue;
    const entry = byLine.get(info.code) ?? { color: info.color, patterns: [] };
    entry.patterns.push(p);
    byLine.set(info.code, entry);
  }

  const lines = [...byLine.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt", { numeric: true }))
    .map(([code, { color, patterns }]) => {
      const patternIds = new Set(patterns.map((p) => p.id));
      const trips = data.trips.filter((t) => patternIds.has(t.patternId));
      return { code, color, ...lineDay(stopId, patterns, trips, data, instantMs, shown, shown === todayType) };
    });

  return { stopId, name, dayType: shown, todayType, lines };
}

function lineDay(
  stopId: string,
  patterns: PatternData[],
  trips: TripData[],
  data: ScheduleSnapshot,
  instantMs: number,
  dayType: DayTypeCode,
  isToday: boolean,
): Omit<DayLine, "code" | "color"> {
  const lineSchedule = lineScheduleOf(trips, data);
  const clock = lisbonWallClock(instantMs);
  const stopIdAt = new Map(patterns.map((p) => [p.id, new Map(p.stops.map((s) => [s.position, s.stopId]))]));
  const endsHere = patterns.every((p) => {
    const last = Math.max(...p.stops.map((s) => s.position));
    return p.stops.filter((s) => s.stopId === stopId).every((s) => s.position === last);
  });

  const candidates = (date: string, type: DayTypeCode, now: number | null): Candidate[] => {
    const running = new Set(tripsRunningOn(date, type, lineSchedule).map((t) => t.id));
    const todays = trips.filter((t) => running.has(t.id));
    const tripById = new Map(todays.map((t) => [t.id, t]));
    return passagesAtStop(stopId, patterns, todays).map((passage) => ({ date, now, passage, trip: tripById.get(passage.tripId)! }));
  };

  let list: Candidate[];
  if (isToday) {
    // Hoje e ontem (as viagens depois da meia-noite). Fica enquanto o fim da faixa, como aparece na tela, não passou.
    const { today, yesterday } = serviceDaysAt(instantMs, data.calendar);
    list = [yesterday, today]
      .flatMap((day) => candidates(day.date, day.dayType.dayType, day.minute))
      .filter((c) => displayCenter(c.passage.expected.rangeEnd) >= c.now!)
      .sort((a, b) => a.passage.expected.center - a.now! - (b.passage.expected.center - b.now!));
  } else {
    list = candidates(clock.date, dayType, null); // época e vigência de hoje (§4.2)
  }

  const nameAt = (patternId: string, position: number) => {
    const id = stopIdAt.get(patternId)?.get(position);
    return id === undefined ? null : (data.stopNames.get(id) ?? null);
  };

  const next = { key: null as string | null };
  const rows: PassageRow[] = list.map((c) => {
    const { passage, trip } = c;
    const { info, expected } = passage;
    const key = `${c.date}/${trip.id}/${info.position}`;
    const isLast = info.position === trip.lastPosition;
    const isFirst = info.position === trip.firstPosition;
    if (isToday && next.key === null && !isLast && expected.center - c.now! >= 0) next.key = key;

    let destination: PassageRow["destination"] = null;
    if (info.destination !== null && info.destination <= trip.lastPosition) {
      const base = baseTimeAt(trip, info.destination);
      const place = nameAt(passage.patternId, info.destination);
      if (base && place) destination = { name: place, time: clockText(displayCenter(base.minute)) };
    }
    return {
      key,
      tripId: trip.id,
      position: info.position,
      time: clockText(displayCenter(expected.center)),
      rangeStart: clockText(displayCenter(expected.rangeStart)),
      rangeEnd: clockText(displayCenter(expected.rangeEnd)),
      beAtStop: clockText(displayBeAtStop(expected.beAtStop)),
      confidence: expected.confidence,
      number: info.number,
      origin: info.origin !== null && info.origin >= trip.firstPosition ? nameAt(passage.patternId, info.origin) : null,
      destination,
      tripDestination: nameAt(passage.patternId, trip.lastPosition),
      isFirst,
      isLast,
      isNext: false,
      mayPassNow: isToday && !isLast && beAtStopPassed(expected, c.now!),
    };
  });
  const finalRows = rows.map((r) => (r.key === next.key ? { ...r, isNext: true } : r));

  if (finalRows.length > 0) {
    const head = finalRows.find((r) => r.isNext) ?? finalRows[0]!;
    return { destination: head.tripDestination, endsHere, rows: finalRows, empty: null };
  }

  // Sem passagens: o porquê (só se a linha nem circula nesse tipo de dia, com a época e a vigência de hoje) e o próximo dia.
  const calendar: CalendarData = isToday
    ? data.calendar
    : { ...data.calendar, overrides: [{ date: clock.date, dayType }, ...data.calendar.overrides.filter((o) => o.date !== clock.date)] };
  const service = lineServiceOn(clock.date, calendar, lineSchedule);
  const reason = service.status === "none" ? reasonOf(service.reason, clock.date, calendar, lineSchedule, true) : null;
  const later = nextServiceState(stopId, patterns, trips, data, instantMs, lineSchedule, reason, true);
  return {
    destination: later.destination,
    endsHere,
    rows: [],
    empty: {
      reason,
      next: later.state.status === "later" ? { date: later.state.date, weekday: later.state.weekday, time: later.state.time } : null,
    },
  };
}
