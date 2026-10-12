/**
 * Regras puras do formulário de criação de linha (E-08 bloco 11, Item 0).
 * Puro: sem React e sem banco.
 */
import type { DayTypeCode } from "@notebus/domain";
import { declaredServiceMinute } from "@notebus/domain";
import { LINE_LIMITS, type LineDraft, type LineDraftReason } from "./lineDraft";
import { MAX_FREQUENCY_TRIPS, type FrequencyRefusal } from "./frequency";
import type { CreateLineRefusal } from "../db/lineCreate";
import type { MessageKey } from "../i18n/pt-BR";

export type DeleteLineRefusal = "not_found" | "official" | "in_use";

export const NEW_LINE_ID = "__new__";

/** Lista fixa de 8 cores hex válidas (#RRGGBB); a primeira (#5B4BD6) é o padrão. */
export const LINE_COLORS = [
  "#5B4BD6",
  "#1E3A8A",
  "#2E7D32",
  "#F57C00",
  "#D32F2F",
  "#C7017F",
  "#7CB342",
  "#00838F",
] as const;

export type LineFormMode = "departures" | "frequency";

export interface LineFormStop {
  id: string;
  name: string;
}

export interface LineFormState {
  code: string;
  name: string;
  color: string;
  patternLabel: string;
  isCircular: boolean;
  stops: LineFormStop[];
  durationText: string;
  dayTypeCodes: DayTypeCode[];
  mode: LineFormMode;
  departures: { hour: number; minute: number }[];
  frequency: {
    fromMinute: number;
    toMinute: number;
    headwayMinutes: number;
  };
}

export const initialLineFormState = (): LineFormState => ({
  code: "",
  name: "",
  color: LINE_COLORS[0],
  patternLabel: "Ida",
  isCircular: false,
  stops: [],
  durationText: "",
  dayTypeCodes: ["weekday"],
  mode: "departures",
  departures: [],
  frequency: {
    fromMinute: 360,
    toMinute: 1200,
    headwayMinutes: 30,
  },
});

/** Monta o rascunho de linha. Só um dos dois (departures ou frequency) vai preenchido. */
export function buildLineDraft(state: LineFormState): LineDraft {
  const durationTrimmed = state.durationText.trim();
  const durationMinutes = /^\d+$/.test(durationTrimmed) ? Number(durationTrimmed) : NaN;

  const draft: LineDraft = {
    code: state.code,
    name: state.name,
    color: state.color,
    pattern: {
      label: state.patternLabel,
      stopIds: state.stops.map((s) => s.id),
      isCircular: state.isCircular,
    },
    durationMinutes,
    dayTypeCodes: state.dayTypeCodes,
  };

  if (state.mode === "departures") {
    draft.departures = state.departures;
  } else {
    draft.frequency = {
      fromMinute: state.frequency.fromMinute,
      toMinute: state.frequency.toMinute,
      headwayMinutes: state.frequency.headwayMinutes,
    };
  }

  return draft;
}

/** Acrescenta horário sem repetir e devolve ordenado pelo relógio de serviço (00:00 a 03:59 depois de 23:59). */
export function addDeparture(
  list: readonly { hour: number; minute: number }[],
  time: { hour: number; minute: number },
): { hour: number; minute: number }[] {
  if (list.some((d) => d.hour === time.hour && d.minute === time.minute)) {
    return [...list];
  }
  const next = [...list, time];
  return next.sort((a, b) => declaredServiceMinute(a.hour, a.minute) - declaredServiceMinute(b.hour, b.minute));
}

/** Remove horário pelo índice. */
export function removeDeparture(
  list: readonly { hour: number; minute: number }[],
  index: number,
): { hour: number; minute: number }[] {
  return list.filter((_, idx) => idx !== index);
}

/** Move paragem na lista trocando com o vizinho; nos extremos devolve a lista igual. */
export function moveStop(
  stops: readonly LineFormStop[],
  index: number,
  direction: "up" | "down" | -1 | 1,
): LineFormStop[] {
  const target = direction === "up" || direction === -1 ? index - 1 : index + 1;
  if (target < 0 || target >= stops.length || index < 0 || index >= stops.length) {
    return [...stops];
  }
  const next = [...stops];
  const temp = next[index]!;
  next[index] = next[target]!;
  next[target] = temp;
  return next;
}

/** Adiciona paragem no fim da lista (permite paragens repetidas, e.g. em linhas circulares). */
export function addStop(stops: readonly LineFormStop[], stop: LineFormStop): LineFormStop[] {
  return [...stops, stop];
}

/** Remove paragem pelo índice. */
export function removeStop(stops: readonly LineFormStop[], index: number): LineFormStop[] {
  return stops.filter((_, idx) => idx !== index);
}

export interface LineFormStopRow {
  id: string;
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  index: number;
}

export interface LineFormView {
  canSave: boolean;
  stopRows: LineFormStopRow[];
  showMadrugadaHint: boolean;
  durationHelperKey: MessageKey;
}

export function lineFormView(state: LineFormState): LineFormView {
  const codeValid = state.code.trim().length > 0;
  const nameValid = state.name.trim().length > 0;
  const stopsValid = state.stops.length >= 2;
  const dayTypesValid = state.dayTypeCodes.length > 0;
  const timesValid =
    state.mode === "departures"
      ? state.departures.length > 0
      : state.frequency.headwayMinutes >= 1 &&
        Number.isInteger(state.frequency.headwayMinutes) &&
        Number.isInteger(state.frequency.fromMinute) &&
        Number.isInteger(state.frequency.toMinute);

  const canSave = codeValid && nameValid && stopsValid && dayTypesValid && timesValid;

  const stopRows: LineFormStopRow[] = state.stops.map((stop, index) => ({
    id: stop.id,
    name: stop.name,
    canMoveUp: index > 0,
    canMoveDown: index < state.stops.length - 1,
    index,
  }));

  const showMadrugadaHint =
    state.mode === "departures"
      ? state.departures.some((d) => d.hour * 60 + d.minute < 240)
      : state.frequency.fromMinute < 240;

  return {
    canSave,
    stopRows,
    showMadrugadaHint,
    durationHelperKey: "line_create.duration.helper",
  };
}

export type LineFormRefusalReason =
  | LineDraftReason
  | CreateLineRefusal
  | DeleteLineRefusal;

function assertNever(x: never): never {
  throw new Error(`Motivo não mapeado: ${x}`);
}

/** Mapeia todos os motivos para chaves do catálogo. */
export function lineRefusalText(reason: LineFormRefusalReason): {
  key: MessageKey;
  params?: Record<string, string | number>;
} {
  switch (reason) {
    case "code_required":
      return { key: "line_create.refusal.code_required" };
    case "code_too_long":
      return { key: "line_create.refusal.code_too_long", params: { max: LINE_LIMITS.codeMax } };
    case "name_required":
      return { key: "line_create.refusal.name_required" };
    case "name_too_long":
      return { key: "line_create.refusal.name_too_long", params: { max: LINE_LIMITS.nameMax } };
    case "color_invalid":
      return { key: "line_create.refusal.color_invalid" };
    case "pattern_label_required":
      return { key: "line_create.refusal.pattern_label_required" };
    case "pattern_label_too_long":
      return { key: "line_create.refusal.pattern_label_too_long", params: { max: LINE_LIMITS.patternLabelMax } };
    case "stops_min":
      return { key: "line_create.refusal.stops_min", params: { min: LINE_LIMITS.stopsMin } };
    case "duration_invalid":
      return { key: "line_create.refusal.duration_invalid", params: { max: LINE_LIMITS.durationMax } };
    case "day_types_required":
      return { key: "line_create.refusal.day_types_required" };
    case "day_type_invalid":
      return { key: "line_create.refusal.day_type_invalid" };
    case "times_required":
      return { key: "line_create.refusal.times_required" };
    case "times_conflict":
      return { key: "line_create.refusal.times_conflict" };
    case "times_invalid":
      return { key: "line_create.refusal.times_invalid" };
    case "ref_position_invalid":
      return { key: "line_create.refusal.ref_position_invalid" };
    case "crosses_cutoff":
      return { key: "line_create.refusal.crosses_cutoff" };
    case "invalid_headway":
      return { key: "line_create.refusal.invalid_headway" };
    case "invalid_range":
      return { key: "line_create.refusal.invalid_range" };
    case "too_many":
      return { key: "line_create.refusal.too_many", params: { max: MAX_FREQUENCY_TRIPS } };
    case "invalid":
      return { key: "line_create.refusal.invalid" };
    case "no_network":
      return { key: "line_create.refusal.no_network" };
    case "duplicate_code":
      return { key: "line_create.refusal.duplicate_code" };
    case "unknown_stop":
      return { key: "line_create.refusal.unknown_stop" };
    case "unknown_day_type":
      return { key: "line_create.refusal.unknown_day_type" };
    case "not_found":
      return { key: "line_delete.not_found" };
    case "official":
      return { key: "line_delete.official" };
    case "in_use":
      return { key: "line_delete.in_use" };
    default:
      return assertNever(reason);
  }
}
