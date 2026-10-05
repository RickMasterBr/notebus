/**
 * Rascunho em memória da TL-06 Registro detalhado (E-04 §3.1, §3.6, D-060, D-061, D-067).
 * Lógica pura sem React nem banco (testada no Node): botões -10..+1, limites, "mais ou menos",
 * conversão para patch e validações prévias.
 */
import {
  DOMAIN_CONFIG,
  type MatchPreview,
  displayCenter,
  intervalAround,
  lisbonWallClock,
  resolvePickedTime,
} from "@notebus/domain";
import type { EditPatch, ObservationRow } from "./registro";
import { clockText } from "./stopCard";
import { t } from "../i18n";

export type DeltaMinutes = -10 | -5 | -2 | -1 | 1;
export type SpreadMinutes = 2 | 5 | 10;
export type TimePrecisionMode = "exact" | "range";

export interface RecordDraft {
  /** O instante central (mantém os segundos originais). */
  centerMs: number;
  precision: TimePrecisionMode;
  spreadMinutes: SpreadMinutes;
  kind: "boarded" | "passed" | "alighted";
  memory: boolean;
  note: string;
}

/** Inicializa o rascunho a partir de uma linha de observação do banco. */
export function initDraft(row: ObservationRow): RecordDraft {
  const hasRange = row.observedEndAt !== null;
  const centerMs = hasRange ? Math.round((row.observedAt + row.observedEndAt!) / 2) : row.observedAt;
  const halfMinutes = hasRange ? Math.round((row.observedEndAt! - row.observedAt) / (2 * 60_000)) : 5;
  const spreadMinutes: SpreadMinutes =
    halfMinutes === 2 || halfMinutes === 5 || halfMinutes === 10 ? halfMinutes : 5;

  return {
    centerMs,
    precision: hasRange ? "range" : "exact",
    spreadMinutes,
    kind: row.kind,
    memory: row.mode === "memory",
    note: row.note ?? "",
  };
}

/** Intervalo [observedAt, observedEndAt] em milissegundos correspondente ao rascunho. */
export function draftInterval(draft: RecordDraft): { observedAt: number; observedEndAt: number | null } {
  if (draft.precision === "range") {
    const range = intervalAround(draft.centerMs, draft.spreadMinutes);
    return { observedAt: range.observedAt, observedEndAt: range.observedEndAt };
  }
  return { observedAt: draft.centerMs, observedEndAt: null };
}

/** O botão +1 fica desabilitado se avançar 1 minuto ultrapassaria o instante atual (D-060). */
export function isPlusOneDisabled(draft: RecordDraft, now: number): boolean {
  return draft.centerMs + 60_000 > now;
}

/** Aplica ajuste em minutos (-10, -5, -2, -1, +1). Mantém os segundos. Não avança no futuro. */
export function applyDelta(draft: RecordDraft, delta: DeltaMinutes, now: number): RecordDraft {
  const nextCenter = draft.centerMs + delta * 60_000;
  if (delta > 0 && nextCenter > now) return draft;
  return { ...draft, centerMs: nextCenter };
}

/** Alterna entre "Exata" e "Mais ou menos". */
export function applyPrecision(draft: RecordDraft, precision: TimePrecisionMode): RecordDraft {
  return { ...draft, precision };
}

/** Seleciona chip de semi-intervalo (± 2, ± 5, ± 10 min) e ativa o modo "range". */
export function applySpread(draft: RecordDraft, spreadMinutes: SpreadMinutes): RecordDraft {
  return { ...draft, precision: "range", spreadMinutes };
}

/** Aplica a hora do seletor nativo (resolvePickedTime até 24 h no passado). Preserva segundos se couber. */
export function applyPickedTime(draft: RecordDraft, hour: number, minute: number, now: number): RecordDraft {
  const picked = resolvePickedTime(hour, minute, now);
  if (picked === null) return draft;
  const originalSecMs = draft.centerMs % 60_000;
  const target = picked + originalSecMs <= now ? picked + originalSecMs : picked;
  return { ...draft, centerMs: target };
}

/** Converte o rascunho em EditPatch contendo apenas o que realmente mudou em relação ao banco. */
export function toPatch(draft: RecordDraft, row: ObservationRow): EditPatch {
  const { observedAt, observedEndAt } = draftInterval(draft);
  const patch: EditPatch = {};

  if (observedAt !== row.observedAt) {
    patch.observedAt = observedAt;
  }

  const rowEnd = row.observedEndAt ?? null;
  const draftEnd = observedEndAt ?? null;
  if (draftEnd !== rowEnd) {
    patch.observedEndAt = draftEnd;
  }

  if (draft.kind !== row.kind && (draft.kind === "boarded" || draft.kind === "passed")) {
    patch.kind = draft.kind;
  }

  const rowMemory = row.mode === "memory";
  if (draft.memory !== rowMemory) {
    patch.memory = draft.memory;
  }

  const rowNote = row.note ?? "";
  const draftNote = draft.note;
  if (draftNote !== rowNote) {
    patch.note = draftNote.trim() === "" ? null : draftNote;
  }

  return patch;
}

/**
 * Regra pura de commit ao fechar a TL-06 (D-062):
 * Devolve `null` se `deleted` ou se o patch é vazio; senão devolve o `EditPatch`.
 */
export function closeCommit(
  draft: RecordDraft,
  row: ObservationRow,
  deleted: boolean,
): EditPatch | null {
  if (deleted) return null;
  const patch = toPatch(draft, row);
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Monta um Date local cujos getHours() e getMinutes() correspondem à hora de parede de Lisboa (Q-93).
 * Evita que o seletor nativo mostre a hora convertida para o fuso local do dispositivo.
 */
export function pickerValue(centerMs: number): Date {
  const wall = lisbonWallClock(centerMs);
  const year = Number(wall.date.slice(0, 4));
  const month = Number(wall.date.slice(5, 7));
  const day = Number(wall.date.slice(8, 10));
  const hour = (wall.minute / 60) | 0;
  const minute = wall.minute % 60;
  return new Date(year, month - 1, day, hour, minute);
}

/** Formata o texto de exibição da hora no cabeçalho/botão da TL-06 ("08:13" ou "08:08–08:18"). */
export function formatDraftTime(draft: RecordDraft): string {
  if (draft.precision === "range") {
    const { observedAt, observedEndAt } = draftInterval(draft);
    const start = clockText(lisbonWallClock(observedAt).minute);
    const end = clockText(lisbonWallClock(observedEndAt!).minute);
    return `${start}–${end}`;
  }
  return clockText(lisbonWallClock(draft.centerMs).minute);
}

/** Frase de casamento ao vivo (D-061, E-04 §3.6). */
export function formatMatchPreview(
  preview: MatchPreview,
  draft: RecordDraft,
  lineCode: string,
): { text: string; kind: "auto" | "orphan" | "ambiguous" } {
  if (preview.status === "auto" && preview.chosen && preview.departureMinute !== null) {
    const tripTime = clockText(preview.departureMinute);
    const passTime = clockText(displayCenter(preview.chosen.base.minute));
    const dev = preview.chosen.deviation;
    const roundedDev = Math.round(dev);
    let relative = t("sheet_record.relative.on_time");
    if (roundedDev > 0) {
      relative = t("sheet_record.relative.late", { minutes: roundedDev });
    } else if (roundedDev < 0) {
      relative = t("sheet_record.relative.early", { minutes: -roundedDev });
    }
    return {
      kind: "auto",
      text: t("sheet_record.match.auto", { trip_time: tripTime, time: passTime, relative }),
    };
  }

  if (preview.status === "ambiguous") {
    return {
      kind: "ambiguous",
      text: t("sheet_record.match.ambiguous"),
    };
  }

  // Órfã: exata ou intervalo
  if (draft.precision === "range") {
    const { observedAt, observedEndAt } = draftInterval(draft);
    const start = clockText(lisbonWallClock(observedAt).minute);
    const end = clockText(lisbonWallClock(observedEndAt!).minute);
    return {
      kind: "orphan",
      text: t("sheet_record.match.orphan_range", { line: lineCode, start, end }),
    };
  }

  const time = clockText(lisbonWallClock(draft.centerMs).minute);
  return {
    kind: "orphan",
    text: t("sheet_record.match.orphan", { line: lineCode, time }),
  };
}

export interface ValidationContext {
  now: number;
  alightRow?: ObservationRow | null;
  boardingRow?: ObservationRow | null;
}

/**
 * Validação prévia exibida na folha antes de fechar (descida antes do embarque, futuro, intervalo > 30 min,
 * ou aviso de "vi passar" num embarque com descida). Não bloqueia o fechamento.
 */
export function validateDraft(
  draft: RecordDraft,
  row: ObservationRow,
  context: ValidationContext,
): string | null {
  const { observedAt, observedEndAt } = draftInterval(draft);

  if (observedAt > context.now) {
    return t("sheet_record.problem.future");
  }

  if (observedEndAt !== null && observedEndAt - observedAt > 30 * 60_000) {
    return t("sheet_record.problem.invalid_interval");
  }

  if (row.kind === "boarded" && context.alightRow) {
    if (draft.kind === "passed") {
      return t("sheet_record.kind_passed_warning");
    }
    if (context.alightRow.observedAt < observedAt) {
      return t("sheet_record.problem.before_boarding");
    }
  }

  if (row.kind === "alighted" && context.boardingRow) {
    if (observedAt < context.boardingRow.observedAt) {
      return t("sheet_record.problem.before_boarding");
    }
  }

  return null;
}
