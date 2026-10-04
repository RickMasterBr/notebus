/**
 * Lógica pura do seletor do relógio de teste (D-095, D-151): somar ou subtrair dia, hora e minuto ao instante escolhido,
 * os textos da faixa e o contador das 7 batidas. Sem React nem relógio do aparelho: o instante vem de quem chama.
 * A hora de Lisboa continua sendo do domínio e do `clock.ts` (D-093); aqui só se mexe na data e no minuto da parede.
 *
 * Exemplo: 23:55 + 5 min = 00:00 do dia seguinte; 00:00 − 5 min = 23:55 do dia anterior.
 */
import { type WallClock, addDays, dayOfWeek, lisbonWallClock } from "@notebus/domain";
import { type MessageKey, t } from "../i18n";

export type PickerUnit = "day" | "hour" | "minute";

const DAY_MINUTES = 1440;
const STEP_MINUTES: Record<PickerUnit, number> = { day: DAY_MINUTES, hour: 60, minute: 1 };

/** Soma (`direction` 1) ou subtrai (−1) um passo: dia ±1 dia, hora ±1 h, minuto ±1 min. Passar da meia-noite muda o dia. */
export function stepWall(wall: WallClock, unit: PickerUnit, direction: 1 | -1): WallClock {
  if (unit === "day") return { date: addDays(wall.date, direction), minute: wall.minute };
  const total = wall.minute + direction * STEP_MINUTES[unit];
  const carry = Math.floor(total / DAY_MINUTES);
  return { date: addDays(wall.date, carry), minute: total - carry * DAY_MINUTES };
}

/** 480 → "08:00". */
export function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "2026-10-08" → "quinta". */
export function weekdayName(date: string): string {
  return t(`common.weekday.${dayOfWeek(date)}` as MessageKey);
}

/** "2026-10-08" → "08/10/2026" (data completa só com números: nenhuma palavra fora do catálogo). */
export function dateNumbers(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** "quinta 08:00": o texto da faixa (D-151). */
export function weekdayTimeText(wall: WallClock): string {
  return `${weekdayName(wall.date)} ${hhmm(wall.minute)}`;
}

/** Faixa vermelha, a partir do instante ligado (a hora mostrada é a de Lisboa que o app realmente usa). */
export function bannerText(instantMs: number): string {
  return t("test_clock.banner", { when: weekdayTimeText(lisbonWallClock(instantMs)) });
}

export function bannerA11yText(instantMs: number): string {
  return t("test_clock.banner.a11y", { when: weekdayTimeText(lisbonWallClock(instantMs)) });
}

/**
 * Contador das 7 batidas (D-151): conta as batidas seguidas; uma pausa maior que `pauseMs` zera antes de contar; na 7ª
 * dispara (devolve `true`) e zera. O instante de cada batida vem de quem chama (o relógio real, nunca o de teste).
 */
export function createTapCounter(target = 7, pauseMs = 1500): { tap(nowMs: number): boolean } {
  let count = 0;
  let last = Number.NEGATIVE_INFINITY;
  return {
    tap(nowMs) {
      count = nowMs - last > pauseMs ? 1 : count + 1;
      last = nowMs;
      if (count < target) return false;
      count = 0;
      return true;
    },
  };
}
