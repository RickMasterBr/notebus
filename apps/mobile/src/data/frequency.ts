/**
 * Saídas de uma linha nova (E-08 §5.3, T-84 e T-85): por frequência ou por horários avulsos. Puro, sem banco.
 * Minutos de serviço (D-016): depois da meia-noite continuam contando (1440 = 24:00).
 */
import { DECLARE_NIGHT_CUTOFF_MINUTES, declaredServiceMinute } from "@notebus/domain";

/** Teto de saídas geradas por uma frequência (proposta da coordenação, a confirmar). */
export const MAX_FREQUENCY_TRIPS = 300;

const MINUTES_PER_DAY = 1440;

export type FrequencyRefusal = "invalid_headway" | "invalid_range" | "too_many";

export type FrequencyResult = { ok: true; minutes: number[] } | { ok: false; reason: FrequencyRefusal };

/** Faixa em minutos de serviço (D-016, D-183 regra e): início de 00:00 a 03:59 é fim do dia de serviço anterior e soma 1440 aos dois extremos. */
export function serviceRange(fromMinute: number, toMinute: number): { start: number; end: number } {
  const shift = fromMinute < DECLARE_NIGHT_CUTOFF_MINUTES ? MINUTES_PER_DAY : 0;
  const end = toMinute < fromMinute ? toMinute + MINUTES_PER_DAY : toMinute;
  return { start: fromMinute + shift, end: end + shift };
}

/** Começa antes das 04:00 e termina às 04:00 ou depois (ou dá a volta): atravessa a virada do dia de serviço. */
export const crossesServiceCutoff = (fromMinute: number, toMinute: number) =>
  fromMinute < DECLARE_NIGHT_CUTOFF_MINUTES && (toMinute >= DECLARE_NIGHT_CUTOFF_MINUTES || toMinute < fromMinute);

const isClockMinute = (value: number) => Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;

/** Saídas de `fromMinute` a `toMinute`, a cada `headwayMinutes`, inclusive nos dois extremos, em minutos de serviço. `toMinute < fromMinute` = passou da meia-noite. */
export function frequencyMinutes(input: { fromMinute: number; toMinute: number; headwayMinutes: number }): FrequencyResult {
  const { fromMinute, toMinute, headwayMinutes } = input;
  if (!Number.isInteger(headwayMinutes) || headwayMinutes < 1) return { ok: false, reason: "invalid_headway" };
  if (!isClockMinute(fromMinute) || !isClockMinute(toMinute)) return { ok: false, reason: "invalid_range" };

  const { start, end } = serviceRange(fromMinute, toMinute);
  if (Math.floor((end - start) / headwayMinutes) + 1 > MAX_FREQUENCY_TRIPS) return { ok: false, reason: "too_many" };

  const minutes: number[] = [];
  for (let minute = start; minute <= end; minute += headwayMinutes) minutes.push(minute);
  return { ok: true, minutes };
}

/** Horários avulsos (hora de relógio) → minutos de serviço, em ordem e sem repetidos. 00:00 a 03:59 vira 1440 a 1679. */
export function departureMinutesFromClock(times: readonly { hour: number; minute: number }[]): number[] {
  const minutes = times.map((t) => declaredServiceMinute(t.hour, t.minute));
  return [...new Set(minutes)].sort((a, b) => a - b);
}

/** Hora na primeira paragem quando a referência é outra: `ref − duração × (refPosition − 1) / (stopCount − 1)`. */
export function firstStopMinute(refMinute: number, durationMinutes: number, stopCount: number, refPosition: number): number {
  if (refPosition === 1) return refMinute;
  return Math.round(refMinute - (durationMinutes * (refPosition - 1)) / (stopCount - 1));
}
