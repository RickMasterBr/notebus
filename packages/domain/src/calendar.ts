/**
 * Calendário (E-02 §3.1–§3.4, Fase 1 §4.0): que tipo de dia é cada data, que dia e minuto de serviço valem num
 * instante, quais viagens circulam numa data e, quando nenhuma circula, por quê e qual é o próximo dia com serviço.
 *
 * Puro: sem banco e sem relógio. Quem chama passa o instante e os dados (o relógio de teste da D-095 depende disso).
 * Datas são texto `AAAA-MM-DD` (a data do relógio de parede em Lisboa), como na tabela `holiday`.
 */
import Holidays from "date-holidays";
import type { DayTypeCode } from "./seedFormat.ts";

// ─── Datas ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** "2026-05-22" → ms UTC da meia-noite dessa data (só para aritmética de datas). */
function dateMs(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** ms UTC → "AAAA-MM-DD". */
function msDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `addDays("2026-12-31", 1)` → "2027-01-01". */
export function addDays(date: string, days: number): string {
  return msDate(dateMs(date) + days * DAY_MS);
}

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(date: string): number {
  return new Date(dateMs(date)).getUTCDay();
}

// ─── Hora de relógio em Europe/Lisbon (D-093, invariante 7) ─────────────────

/** Último domingo do mês (0-based) às 01:00 UTC: é quando a UE muda a hora. */
function lastSundayAt1Utc(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0)); // último dia do mês
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
}

/**
 * Regra da UE à mão, sem `Intl` (o Hermes não garante fusos): WEST (UTC+1) de 01:00 UTC do último domingo de março
 * até 01:00 UTC do último domingo de outubro; WET (UTC+0) no resto. Testada contra o `Intl` do Node (2026–2030).
 */
function lisbonOffsetMs(instantMs: number): number {
  const year = new Date(instantMs).getUTCFullYear();
  const inSummer = instantMs >= lastSundayAt1Utc(year, 2) && instantMs < lastSundayAt1Utc(year, 9);
  return inSummer ? 3_600_000 : 0;
}

/** O que o relógio da parede mostra em Lisboa: a data e o minuto desde a meia-noite (0–1439). */
export interface WallClock {
  date: string;
  minute: number;
}

/**
 * Instante (epoch ms UTC) → data e minuto do relógio de parede em Lisboa. Os segundos são descartados.
 * Na hora repetida de outubro, as duas 01:30 dão o mesmo minuto (90); a hora que falta em março nunca aparece.
 */
export function lisbonWallClock(instantMs: number): WallClock {
  const local = instantMs + lisbonOffsetMs(instantMs);
  const date = msDate(local);
  return { date, minute: Math.floor((local - dateMs(date)) / 60_000) };
}

/**
 * Relógio de parede de Lisboa → instantes (epoch ms UTC) em que a parede mostrou essa data e minuto. É a conversão
 * inversa de `lisbonWallClock`: normalmente um instante; **dois** na hora repetida de outubro (as duas 01:30);
 * **nenhum** na hora que não existe em março (01:30 do dia da mudança). Do menor para o maior.
 */
export function lisbonInstants(date: string, minute: number): number[] {
  const local = dateMs(date) + minute * 60_000;
  return [local - 3_600_000, local].filter((instant) => instant + lisbonOffsetMs(instant) === local);
}

// ─── Tipo de dia (§3.1) ─────────────────────────────────────────────────────

/** Por que a data tem este tipo de dia, pela ordem da Fase 1 §4.0. `weekday` = pelo dia da semana. */
export type DayTypeReason = "override" | "holiday" | "weekday";

export interface DayTypeResult {
  dayType: DayTypeCode;
  reason: DayTypeReason;
  /** Nome do feriado, quando `reason = holiday`. */
  holidayName?: string;
}

/**
 * O que o banco guarda do calendário: exceções (`date_override`, já com o código do tipo de dia) e os feriados
 * gravados (`holiday`: o municipal do seed e, na E-08, os manuais). Os nacionais não vêm daqui: vêm da biblioteca.
 *
 * Campos da E-08 (D-114), todos opcionais; ausente = o comportamento de antes. `scope` diz de onde o feriado veio;
 * `recurring` o faz valer todo ano (mesmo mês e dia); `includeMunicipal: false` desliga os municipais (os manuais e os
 * nacionais nunca são afetados por esse interruptor).
 */
export interface CalendarData {
  overrides: { date: string; dayType: DayTypeCode }[];
  holidays: { date: string; name: string; scope?: "municipal" | "manual"; recurring?: boolean }[];
  includeMunicipal?: boolean;
}

let holidaysPT: Holidays | undefined;
const nationalByYear = new Map<number, Map<string, string>>();

/**
 * Feriados nacionais de Portugal num ano (P-07): `date-holidays`, país PT, sem subdivisão, **só `type = public`**.
 * Observâncias (Carnaval, véspera de Natal, véspera de Ano Novo, Dia das Mães) ficam de fora.
 */
function nationalHolidays(year: number): Map<string, string> {
  let found = nationalByYear.get(year);
  if (!found) {
    holidaysPT ??= new Holidays("PT");
    found = new Map(holidaysPT.getHolidays(year).filter((h) => h.type === "public").map((h) => [h.date.slice(0, 10), h.name]));
    nationalByYear.set(year, found);
  }
  return found;
}

/** O tipo de dia só pelo dia da semana: seg–sex útil, sábado, domingo. */
function calendarDayType(date: string): DayTypeCode {
  const dow = dayOfWeek(date);
  return dow === 0 ? "sunday_holiday" : dow === 6 ? "saturday" : "weekday";
}

type CalendarHoliday = CalendarData["holidays"][number];

/**
 * O feriado gravado vale nesta data? Data igual, ou `recurring` com o mesmo mês e dia em qualquer ano. O 29/02 que repete
 * só vale em 29/02 (ano bissexto): não vira 28/02 nem 01/03. Municipal desligado pelo interruptor não vale.
 */
function holidayAppliesOn(holiday: CalendarHoliday, date: string, includeMunicipal: boolean): boolean {
  if (holiday.scope === "municipal" && !includeMunicipal) return false;
  return holiday.date === date || (holiday.recurring === true && holiday.date.slice(5) === date.slice(5));
}

/** O nome do feriado gravado desta data; se um manual e um municipal coincidem, vale o do manual. */
function storedHolidayName(date: string, calendar: CalendarData): string | undefined {
  const includeMunicipal = calendar.includeMunicipal !== false;
  const matches = calendar.holidays.filter((h) => holidayAppliesOn(h, date, includeMunicipal));
  return (matches.find((h) => h.scope === "manual") ?? matches[0])?.name;
}

/**
 * Que tipo de dia é esta data (Fase 1 §4.0, invariante 6): exceção › feriado (nacional ou gravado) › dia da semana.
 * Devolve também o motivo, para a tela poder dizer "é feriado".
 */
export function dayTypeOf(date: string, calendar: CalendarData): DayTypeResult {
  const override = calendar.overrides.find((o) => o.date === date);
  if (override) return { dayType: override.dayType, reason: "override" };
  const holidayName = storedHolidayName(date, calendar) ?? nationalHolidays(Number(date.slice(0, 4))).get(date);
  if (holidayName !== undefined) return { dayType: "sunday_holiday", reason: "holiday", holidayName };
  return { dayType: calendarDayType(date), reason: "weekday" };
}

// ─── Dia e minuto de serviço (§3.3, D-016) ──────────────────────────────────

/** Um dia de serviço olhado num instante: a sua data, o minuto de serviço desse instante e o **seu** tipo de dia. */
export interface ServiceDay {
  date: string;
  minute: number;
  dayType: DayTypeResult;
}

/**
 * Os dois dias de serviço a olhar num instante: hoje (minuto = o do relógio) e ontem (minuto = o do relógio + 1440,
 * para as viagens depois da meia-noite, como a "00:00" de sábado = 24:00). Cada um com o seu tipo de dia.
 */
export function serviceDaysAt(instantMs: number, calendar: CalendarData): { today: ServiceDay; yesterday: ServiceDay } {
  const clock = lisbonWallClock(instantMs);
  const yesterday = addDays(clock.date, -1);
  return {
    today: { date: clock.date, minute: clock.minute, dayType: dayTypeOf(clock.date, calendar) },
    yesterday: { date: yesterday, minute: clock.minute + 1440, dayType: dayTypeOf(yesterday, calendar) },
  };
}

// ─── Quais viagens circulam (§3.4) e por que não (§4.2) ─────────────────────

/** O mínimo de cada viagem para saber se circula; as telas leem do banco e passam isto. */
export interface ScheduleTrip {
  id: string;
  timetableId: string;
  dayTypes: DayTypeCode[];
  seasonId: string | null;
  deletedAt?: number | null;
}

export interface ScheduleData {
  trips: ScheduleTrip[];
  timetables: { id: string; validFrom: string; validTo: string | null }[];
  seasons: { id: string; startMd: string; endMd: string; mode: "include" | "exclude" }[];
}

/** "MM-DD" dentro do intervalo anual, com ou sem virada de ano ("12-15" a "01-15"). */
function inAnnualRange(md: string, startMd: string, endMd: string): boolean {
  return startMd <= endMd ? startMd <= md && md <= endMd : md >= startMd || md <= endMd;
}

/** A época deixa a viagem circular nesta data? `exclude` tira o intervalo; `include` só deixa o intervalo. */
function seasonAllows(date: string, season: ScheduleData["seasons"][number] | undefined): boolean {
  if (!season) return true;
  const inside = inAnnualRange(date.slice(5), season.startMd, season.endMd);
  return season.mode === "exclude" ? !inside : inside;
}

/** Viagens não apagadas cuja tabela está em vigência na data (`valid_to` vazio = aberto). */
function liveTripsInForce(date: string, data: ScheduleData): ScheduleTrip[] {
  const inForce = new Set(data.timetables.filter((t) => t.validFrom <= date && (t.validTo === null || date <= t.validTo)).map((t) => t.id));
  return data.trips.filter((t) => t.deletedAt == null && inForce.has(t.timetableId));
}

/**
 * As viagens que circulam no dia de serviço `date`, de tipo `dayType` (§3.4): tabela em vigência, tipo de dia
 * em `trip_day_type`, época que não exclui a data, viagem não apagada.
 */
export function tripsRunningOn(date: string, dayType: DayTypeCode, data: ScheduleData): ScheduleTrip[] {
  const seasons = new Map(data.seasons.map((s) => [s.id, s]));
  return liveTripsInForce(date, data).filter(
    (t) => t.dayTypes.includes(dayType) && seasonAllows(date, t.seasonId === null ? undefined : seasons.get(t.seasonId)),
  );
}

/**
 * Por que uma linha não circula numa data (§4.2, T-32). Os textos são do bloco 4.
 * - `feriado`: a data é feriado e o tipo de dia dela sem o feriado teria serviço.
 * - `so_dias_uteis`: a linha só tem viagens de dia útil.
 * - `sem_tabela`: a linha não tem tabela para esse tipo de dia (nem nenhuma em vigência).
 * - `epoca`: há viagens para o tipo de dia, mas a época tira todas (julho e agosto).
 */
export type NoServiceReason = "sem_tabela" | "so_dias_uteis" | "epoca" | "feriado";

export type LineService =
  | { status: "running"; trips: ScheduleTrip[] }
  | { status: "none"; reason: NoServiceReason; nextServiceDate: string | null };

/** Até onde procurar o próximo dia com serviço: um ano e um pouco cobre qualquer época anual. */
const NEXT_SERVICE_HORIZON_DAYS = 400;

/**
 * As viagens de **uma linha** (passe só as dela) que circulam na data; se nenhuma, o motivo e a próxima data
 * com serviço (`null` se não houver nenhuma no próximo ano).
 */
export function lineServiceOn(date: string, calendar: CalendarData, data: ScheduleData): LineService {
  const dayType = dayTypeOf(date, calendar);
  const trips = tripsRunningOn(date, dayType.dayType, data);
  if (trips.length > 0) return { status: "running", trips };
  return { status: "none", reason: noServiceReason(date, dayType, data), nextServiceDate: nextServiceDate(date, calendar, data) };
}

/** Alguma viagem não apagada do tipo de dia seria tirada pela época nesta data (sem olhar a vigência)? */
export function excludedBySeason(date: string, dayType: DayTypeCode, data: ScheduleData): boolean {
  const seasons = new Map(data.seasons.map((s) => [s.id, s]));
  return data.trips.some((t) => {
    const season = t.seasonId === null ? undefined : seasons.get(t.seasonId);
    return t.deletedAt == null && t.dayTypes.includes(dayType) && season !== undefined && !seasonAllows(date, season);
  });
}

function noServiceReason(date: string, dayType: DayTypeResult, data: ScheduleData): NoServiceReason {
  const live = liveTripsInForce(date, data);
  const ofDayType = live.filter((t) => t.dayTypes.includes(dayType.dayType));
  if (ofDayType.length > 0) return "epoca";
  // Antes de a tabela entrar em vigência (a da MOBILIS vale de 01/09/2026): se a época tira a data, é a época o motivo.
  if (live.length === 0 && excludedBySeason(date, dayType.dayType, data)) return "epoca";
  if (dayType.reason === "holiday" && tripsRunningOn(date, calendarDayType(date), data).length > 0) return "feriado";
  if (live.length > 0 && live.every((t) => t.dayTypes.every((d) => d === "weekday"))) return "so_dias_uteis";
  return "sem_tabela";
}

function nextServiceDate(date: string, calendar: CalendarData, data: ScheduleData): string | null {
  for (let i = 1; i <= NEXT_SERVICE_HORIZON_DAYS; i++) {
    const next = addDays(date, i);
    if (tripsRunningOn(next, dayTypeOf(next, calendar).dayType, data).length > 0) return next;
  }
  return null;
}
