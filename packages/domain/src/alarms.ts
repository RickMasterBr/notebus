/**
 * Aviso de saída (E-06 §3, §4.3, §6; D-101, D-103, D-105): o que é um aviso ligado, as saídas que ele gera nos próximos
 * dias, a janela de avisos agendados, os parâmetros do texto, o "Adiar", os estados do histórico e a substituição por dia.
 *
 * Puro: sem banco, sem relógio (o "agora" chega como argumento) e sem texto de tela (a frase é do catálogo, no app).
 * Os horários de "esteja no ponto às" e "ônibus às" são minutos de serviço inteiros (D-016, D-092); os instantes
 * (`leaveAt`, `beAtStopAt`) são epoch ms UTC, calculados no fuso da rede (invariante 7).
 */

import { addDays, dayOfWeek, lisbonInstants, lisbonWallClock, type DayTypeResult } from "./calendar.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { walkTimes, type BusOption } from "./goto.ts";
import { baseTimeAt, displayBeAtStop, displayCenter, expectedTime, type PassageRecord, type TripData } from "./passages.ts";
import { formatServiceMinute } from "./serviceMinute.ts";

// ─── Entrada ────────────────────────────────────────────────────────────────

/** O aviso ligado (E-06 §3.1, D-101). `weekdays`: 0 = domingo … 6 = sábado (como `dayOfWeek`). */
export interface AlarmRule {
  id: string;
  optionId: string;
  /** A viagem em que o aviso foi criado e o seu horário-base no embarque da opção (minuto de serviço). */
  anchorTripId: string;
  anchorBaseMinute: number;
  /** Dias em que repete. Vazio: vale só na `onceDate`. */
  weekdays: number[];
  /** `AAAA-MM-DD` do "só hoje"; `null` quando repete. */
  onceDate: string | null;
  validFrom: string;
  /** `null` = sem fim. */
  validTo: string | null;
  enabled: boolean;
}

/** A opção de ônibus do aviso, com o que o texto precisa: o código da linha e o nome do ponto de embarque. */
export interface AlarmOption extends BusOption {
  lineCode: string;
  boardStopName: string;
}

/** O que `busCandidates` recebe de um dia, mais o tipo de dia com o motivo (`dayTypeOf`) e se a época tira viagens. */
export interface AlarmDayData {
  /** As viagens que circulam no dia (`tripsRunningOn`). */
  trips: readonly TripData[];
  records: readonly PassageRecord[];
  dayType: DayTypeResult;
  validFrom: (tripId: string) => string | null;
  /** `excludedBySeason` do dia: se não há viagem de base igual, o motivo é a época. */
  seasonExcluded: boolean;
}

export interface PlanInput {
  alarms: readonly AlarmRule[];
  options: readonly AlarmOption[];
  /** "Agora" (epoch ms UTC). */
  now: number;
  dayData: (serviceDate: string) => AlarmDayData;
  config?: DomainConfig;
}

// ─── Saída ──────────────────────────────────────────────────────────────────

export interface PlannedDeparture {
  alarmId: string;
  optionId: string;
  serviceDate: string;
  tripId: string;
  /** "Sair às" (epoch ms UTC). */
  leaveAt: number;
  /** "Esteja no ponto às": minuto de serviço, para baixo (D-092), e o mesmo instante em epoch ms. */
  beAtStop: number;
  beAtStopAt: number;
  /** Horário esperado do ônibus no embarque, para mostrar (minuto de serviço). */
  busTime: number;
  lineCode: string;
  stopName: string;
}

export type SkipReason = "holiday" | "override" | "no_trip" | "season";

export interface SkippedDeparture {
  alarmId: string;
  serviceDate: string;
  reason: SkipReason;
}

export interface DeparturePlan {
  departures: PlannedDeparture[];
  skipped: SkippedDeparture[];
}

// ─── Saídas de cada aviso (T-53, T-62) ──────────────────────────────────────

const MINUTE_MS = 60_000;

/** O aviso vale nesta data? (intervalo, ligado, dia da semana ou data única). */
function appliesOn(alarm: AlarmRule, date: string): boolean {
  if (!alarm.enabled) return false;
  if (date < alarm.validFrom || (alarm.validTo !== null && date > alarm.validTo)) return false;
  return alarm.weekdays.length > 0 ? alarm.weekdays.includes(dayOfWeek(date)) : alarm.onceDate === date;
}

/** A viagem de mesma base no embarque (D-101); com várias, a âncora se está entre elas, senão a de menor `id`. */
function tripWithBase(option: AlarmOption, alarm: AlarmRule, day: AlarmDayData): TripData | undefined {
  const found = day.trips
    .filter((t) => t.patternId === option.pattern.id && baseTimeAt(t, option.boardPosition)?.minute === alarm.anchorBaseMinute)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found.find((t) => t.id === alarm.anchorTripId) ?? found[0];
}

function departureOn(option: AlarmOption, alarm: AlarmRule, date: string, day: AlarmDayData, trip: TripData, input: PlanInput): PlannedDeparture | null {
  const config = input.config ?? DOMAIN_CONFIG;
  const boardStop = option.pattern.stops.find((s) => s.position === option.boardPosition);
  const base = baseTimeAt(trip, option.boardPosition);
  if (!boardStop || !base) return null;
  const target = { tripId: trip.id, patternId: trip.patternId, position: option.boardPosition, stopId: boardStop.stopId, dayType: day.dayType.dayType, validFrom: day.validFrom(trip.id) };
  const board = expectedTime(base, day.records, { target, now: input.now, config });
  const beAtStop = displayBeAtStop(board.beAtStop);
  const leaveMinute = Math.floor(beAtStop - walkTimes(option.walkToBoard).leave);
  const leaveAt = lisbonInstants(date, leaveMinute)[0];
  const beAtStopAt = lisbonInstants(date, beAtStop)[0];
  if (leaveAt === undefined || beAtStopAt === undefined) return null; // hora que não existe na mudança de março
  return {
    alarmId: alarm.id,
    optionId: option.id,
    serviceDate: date,
    tripId: trip.id,
    leaveAt,
    beAtStop,
    beAtStopAt,
    busTime: displayCenter(board.center),
    lineCode: option.lineCode,
    stopName: option.boardStopName,
  };
}

/**
 * As saídas dos avisos de `now` até `alarmHorizonDays` dias à frente (dias do relógio de Lisboa, hoje e o último
 * inclusive), em ordem de `leaveAt`, e os dias pulados com o motivo. Avisos de uma opção desconhecida são ignorados.
 * Olha também o dia de ontem: a viagem depois da meia-noite pertence ao dia de serviço anterior (D-016).
 */
export function planDepartures(input: PlanInput): DeparturePlan {
  const config = input.config ?? DOMAIN_CONFIG;
  const today = lisbonWallClock(input.now).date;
  const nowMinuteMs = Math.floor(input.now / MINUTE_MS) * MINUTE_MS;
  const options = new Map(input.options.map((o) => [o.id, o]));
  const dayCache = new Map<string, AlarmDayData>();
  const dayOf = (date: string) => {
    let day = dayCache.get(date);
    if (!day) dayCache.set(date, (day = input.dayData(date)));
    return day;
  };

  const departures: PlannedDeparture[] = [];
  const skipped: SkippedDeparture[] = [];
  for (let i = -1; i <= config.alarmHorizonDays; i++) {
    const date = addDays(today, i);
    for (const alarm of input.alarms) {
      const option = options.get(alarm.optionId);
      if (!option || !appliesOn(alarm, date)) continue;
      const day = dayOf(date);
      const skip = (reason: SkipReason) => {
        if (i >= 0) skipped.push({ alarmId: alarm.id, serviceDate: date, reason });
      };
      const repeats = alarm.weekdays.length > 0;
      if (repeats && (day.dayType.reason === "holiday" || day.dayType.reason === "override")) {
        skip(day.dayType.reason);
        continue;
      }
      const trip = tripWithBase(option, alarm, day);
      if (!trip) {
        skip(day.seasonExcluded ? "season" : "no_trip");
        continue;
      }
      const departure = departureOn(option, alarm, date, day, trip, input);
      if (departure && departure.leaveAt >= nowMinuteMs) departures.push(departure);
    }
  }
  const unique = dedupeDepartures(departures, input.alarms);
  unique.sort((a, b) => a.leaveAt - b.leaveAt || compareText(a.alarmId, b.alarmId) || compareText(a.serviceDate, b.serviceDate));
  skipped.sort((a, b) => compareText(a.serviceDate, b.serviceDate) || compareText(a.alarmId, b.alarmId));
  return { departures: unique, skipped };
}

/**
 * Dois avisos que dão a mesma saída (mesma opção, mesma `serviceDate`, mesmo `leaveAt`) valem uma só (D-176): fica a do
 * aviso de data única; se ambos repetem (ou ambos são de data única), a do menor `id` de aviso.
 */
function dedupeDepartures(departures: readonly PlannedDeparture[], alarms: readonly AlarmRule[]): PlannedDeparture[] {
  const isOnce = new Set(alarms.filter((a) => a.weekdays.length === 0).map((a) => a.id));
  const kept = new Map<string, PlannedDeparture>();
  for (const d of departures) {
    const key = `${d.optionId}|${d.serviceDate}|${d.leaveAt}`;
    const current = kept.get(key);
    const wins = !current || (isOnce.has(d.alarmId) && !isOnce.has(current.alarmId)) || (isOnce.has(d.alarmId) === isOnce.has(current.alarmId) && compareText(d.alarmId, current.alarmId) < 0);
    if (wins) kept.set(key, d);
  }
  return [...kept.values()];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── Janela de avisos (T-51, T-52) ──────────────────────────────────────────

export interface WindowDeparture extends PlannedDeparture {
  /** A última da janela, quando sobrou saída fora dela: o aviso acrescenta "Abra o NoteBus para renovar". */
  renewHint: boolean;
}

/** As `alarmWindowSize` saídas mais próximas; `overflow` quando sobrou alguma fora. Mesma entrada, mesma saída. */
export function buildWindow(
  departures: readonly PlannedDeparture[],
  config: DomainConfig = DOMAIN_CONFIG,
): { window: WindowDeparture[]; overflow: boolean } {
  const sorted = [...departures].sort((a, b) => a.leaveAt - b.leaveAt || compareText(a.alarmId, b.alarmId) || compareText(a.serviceDate, b.serviceDate));
  const overflow = sorted.length > config.alarmWindowSize;
  const window = sorted.slice(0, config.alarmWindowSize).map((d, i, kept) => ({ ...d, renewHint: overflow && i === kept.length - 1 }));
  return { window, overflow };
}

// ─── Texto e Adiar (T-54, T-56) ─────────────────────────────────────────────

/** Os parâmetros de `notif.body`: `{{line}}`, `{{time}}`, `{{stop_name}}`, `{{arrive_time}}` (a frase é do catálogo). */
export function alarmTextParams(departure: PlannedDeparture): { line: string; time: string; stopName: string; arriveTime: string } {
  return {
    line: departure.lineCode,
    time: formatServiceMinute(departure.busTime),
    stopName: departure.stopName,
    arriveTime: formatServiceMinute(departure.beAtStop),
  };
}

/** O novo aviso do "Adiar" e se ele já passa do "esteja no ponto às" (então o corpo avisa, `notif.snoozed_body`). */
export function snoozePlan(nowMs: number, beAtStopMs: number, config: DomainConfig = DOMAIN_CONFIG): { at: number; afterStop: boolean } {
  const at = nowMs + config.alarmSnoozeMinutes * MINUTE_MS;
  return { at, afterStop: at > beAtStopMs };
}

// ─── Estados do histórico (T-58, D-103) ─────────────────────────────────────

export type AlarmAction = "boarded" | "snoozed" | "dismissed";
export type AlarmEventState = "scheduled" | "delivered" | "unconfirmed" | "skipped" | AlarmAction;

export interface AlarmEventInput {
  plannedAt: number;
  now: number;
  /** A ação gravada pelo botão do aviso, ou `null`. */
  action: AlarmAction | null;
  /** O aviso estava na central de notificações quando o app abriu. */
  inTray: boolean;
  skipReason: SkipReason | null;
}

/**
 * O estado de uma saída no histórico, nesta precedência: pulada › ação gravada › futura (`scheduled`) › na central
 * (`delivered`) › `unconfirmed`. **`unconfirmed` não afirma que o aviso falhou:** o app não distingue "apagou sem tocar"
 * de "não tocou" (D-103).
 */
export function resolveAlarmEventState(input: AlarmEventInput): { state: AlarmEventState; skipReason: SkipReason | null } {
  if (input.skipReason !== null) return { state: "skipped", skipReason: input.skipReason };
  if (input.action !== null) return { state: input.action, skipReason: null };
  if (input.plannedAt > input.now) return { state: "scheduled", skipReason: null };
  return { state: input.inTray ? "delivered" : "unconfirmed", skipReason: null };
}

// ─── Substituição por dia (T-61, D-105) ─────────────────────────────────────

export interface AlarmReplacement {
  alarmId: string;
  /** Os dias da semana que o aviso antigo perdeu (vazio, se foi o aviso de data única). */
  weekdays: number[];
  /** Só o aviso de data única: a data que perdeu. */
  onceDate?: string;
}

export interface ApplyAlarmResult {
  next: AlarmRule[];
  replaced: AlarmReplacement[];
  /** Desfaz tudo: devolve `existing` exatamente como estava. */
  undo: () => AlarmRule[];
}

const copyRule = (rule: AlarmRule): AlarmRule => ({ ...rule, weekdays: [...rule.weekdays] });

/**
 * Um aviso por opção e por dia da semana (D-105): o aviso novo, ligado, **substitui** o antigo (ligado) da mesma opção
 * nos dias em comum; o antigo continua nos outros dias. Aviso que perde todos os dias é desativado, **não apagado**.
 * Aviso de data única substitui só o aviso de data única da mesma opção e data. Com o mesmo `id` de um existente,
 * é uma edição: troca o existente. Os intervalos de datas não entram na conta.
 */
export function applyAlarm(existing: readonly AlarmRule[], incoming: AlarmRule): ApplyAlarmResult {
  const before = existing.map(copyRule);
  const replaced: AlarmReplacement[] = [];
  const adjust = (old: AlarmRule): AlarmRule => {
    if (old.id === incoming.id || !incoming.enabled || !old.enabled || old.optionId !== incoming.optionId) return copyRule(old);
    if (incoming.weekdays.length === 0) {
      const sameDate = old.weekdays.length === 0 && incoming.onceDate !== null && old.onceDate === incoming.onceDate;
      if (!sameDate) return copyRule(old);
      replaced.push({ alarmId: old.id, weekdays: [], onceDate: incoming.onceDate! });
      return { ...copyRule(old), enabled: false };
    }
    const lost = old.weekdays.filter((d) => incoming.weekdays.includes(d));
    if (lost.length === 0) return copyRule(old);
    replaced.push({ alarmId: old.id, weekdays: lost });
    const kept = old.weekdays.filter((d) => !incoming.weekdays.includes(d));
    return { ...copyRule(old), weekdays: kept, enabled: kept.length > 0 };
  };
  const next = existing.map((old) => (old.id === incoming.id ? copyRule(incoming) : adjust(old)));
  if (!existing.some((old) => old.id === incoming.id)) next.push(copyRule(incoming));
  return { next, replaced, undo: () => before.map(copyRule) };
}
