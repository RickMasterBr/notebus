/**
 * Rascunho da Nova linha (E-08 §5.3): valida o que a tela vai montar e devolve o valor já normalizado, com as saídas
 * calculadas. Puro, sem banco. Os motivos são códigos; os textos vêm com as telas.
 */
import type { DayTypeCode } from "@notebus/domain";
import { departureMinutesFromClock, firstStopMinute, frequencyMinutes, type FrequencyRefusal } from "./frequency";

export const LINE_LIMITS = {
  codeMax: 6,
  nameMax: 60,
  patternLabelMax: 60,
  durationMax: 300,
  stopsMin: 2,
} as const;

const DAY_TYPE_CODES: readonly DayTypeCode[] = ["weekday", "saturday", "sunday_holiday"];
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const MINUTES_PER_DAY = 1440;

export type LineDraft = {
  code: string;
  name: string;
  color: string;
  pattern: { label: string; stopIds: string[]; isCircular?: boolean };
  durationMinutes: number;
  dayTypeCodes: DayTypeCode[];
  departures?: { hour: number; minute: number }[];
  frequency?: { fromMinute: number; toMinute: number; headwayMinutes: number; refPosition?: number };
};

export type LineDraftReason =
  | "code_required"
  | "code_too_long"
  | "name_required"
  | "name_too_long"
  | "color_invalid"
  | "pattern_label_required"
  | "pattern_label_too_long"
  | "stops_min"
  | "duration_invalid"
  | "day_types_required"
  | "day_type_invalid"
  | "times_required"
  | "times_conflict"
  | "times_invalid"
  | "ref_position_invalid"
  | FrequencyRefusal;

/** O rascunho conferido: texto aparado, tipos de dia sem repetição e as saídas em minutos de serviço na 1ª paragem. */
export type ValidLineDraft = {
  code: string;
  name: string;
  color: string;
  pattern: { label: string; stopIds: string[]; isCircular: boolean };
  durationMinutes: number;
  dayTypeCodes: DayTypeCode[];
  /** Minuto de serviço da saída na primeira paragem, em ordem crescente (1440 ou mais = depois da meia-noite). */
  departureMinutes: number[];
  /** Presente só quando as saídas vêm de uma frequência; `toMinute` já com +1440 se passou da meia-noite. */
  frequency: { refPosition: number; fromMinute: number; toMinute: number; headwayMinutes: number } | null;
};

export type LineDraftResult = { ok: true; value: ValidLineDraft } | { ok: false; reasons: LineDraftReason[] };

const isClockTime = (t: { hour: number; minute: number }) =>
  Number.isInteger(t.hour) && t.hour >= 0 && t.hour <= 23 && Number.isInteger(t.minute) && t.minute >= 0 && t.minute <= 59;

export function validateLineDraft(draft: LineDraft): LineDraftResult {
  const reasons: LineDraftReason[] = [];

  const code = draft.code.trim();
  if (code.length === 0) reasons.push("code_required");
  else if (code.length > LINE_LIMITS.codeMax) reasons.push("code_too_long");

  const name = draft.name.trim();
  if (name.length === 0) reasons.push("name_required");
  else if (name.length > LINE_LIMITS.nameMax) reasons.push("name_too_long");

  const color = draft.color.trim();
  if (!COLOR_PATTERN.test(color)) reasons.push("color_invalid");

  const label = draft.pattern.label.trim();
  if (label.length === 0) reasons.push("pattern_label_required");
  else if (label.length > LINE_LIMITS.patternLabelMax) reasons.push("pattern_label_too_long");

  const stopIds = draft.pattern.stopIds;
  if (stopIds.length < LINE_LIMITS.stopsMin) reasons.push("stops_min");

  const { durationMinutes } = draft;
  const durationOk = Number.isInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= LINE_LIMITS.durationMax;
  if (!durationOk) reasons.push("duration_invalid");

  const dayTypeCodes = [...new Set(draft.dayTypeCodes)];
  if (dayTypeCodes.length === 0) reasons.push("day_types_required");
  else if (dayTypeCodes.some((c) => !DAY_TYPE_CODES.includes(c))) reasons.push("day_type_invalid");

  const hasDepartures = (draft.departures?.length ?? 0) > 0;
  let departureMinutes: number[] = [];
  let frequency: ValidLineDraft["frequency"] = null;

  if (hasDepartures && draft.frequency) {
    reasons.push("times_conflict");
  } else if (!hasDepartures && !draft.frequency) {
    reasons.push("times_required");
  } else if (draft.departures && hasDepartures) {
    if (draft.departures.every(isClockTime)) departureMinutes = departureMinutesFromClock(draft.departures);
    else reasons.push("times_invalid");
  } else if (draft.frequency) {
    const { fromMinute, toMinute, headwayMinutes } = draft.frequency;
    const refPosition = draft.frequency.refPosition ?? 1;
    const generated = frequencyMinutes({ fromMinute, toMinute, headwayMinutes });
    if (!generated.ok) {
      reasons.push(generated.reason);
    } else if (!Number.isInteger(refPosition) || refPosition < 1 || refPosition > stopIds.length) {
      reasons.push("ref_position_invalid");
    } else if (durationOk && stopIds.length >= LINE_LIMITS.stopsMin) {
      const shifted = generated.minutes.map((m) => firstStopMinute(m, durationMinutes, stopIds.length, refPosition));
      if (shifted.some((m) => m < 0)) {
        reasons.push("ref_position_invalid");
      } else {
        departureMinutes = shifted;
        frequency = {
          refPosition,
          fromMinute,
          toMinute: toMinute < fromMinute ? toMinute + MINUTES_PER_DAY : toMinute,
          headwayMinutes,
        };
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    value: {
      code,
      name,
      color,
      pattern: { label, stopIds: [...stopIds], isCircular: draft.pattern.isCircular ?? false },
      durationMinutes,
      dayTypeCodes,
      departureMinutes,
      frequency,
    },
  };
}
