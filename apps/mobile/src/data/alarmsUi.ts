/**
 * Camada de dados das telas de avisos de saída (E-06 Bloco 3, Item 1), fora do React.
 * Funções puras: sem expo-*, sem relógio direto, lógica testável pelo Node.
 */
import {
  baseTimeAt,
  dayOfWeek,
  formatServiceMinute,
  lisbonWallClock,
  type AlarmEventState,
  type SkipReason,
  type TripData,
} from "@notebus/domain";
import type { AlarmEventRow, AlarmRow, NewAlarm } from "../db/alarms";
import { t } from "../i18n";
import { DEPARTURE_CATEGORY } from "../notifications/categories";
import { readDeparture } from "../notifications/payload";
import type { ScheduledRequest } from "../notifications/port";

export type RepeatPresetKind = "once" | "daily" | "weekdays" | "weekly" | "custom";

export interface RepeatPreset {
  kind: RepeatPresetKind;
  weekdays: number[];
  onceDate: string | null;
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const WORK_WEEKDAYS = [1, 2, 3, 4, 5];
// Ordem segunda a domingo (1..6, 0)
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type WeekdayPluralKey = `common.weekday.plural.${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type WeekdayShortKey = `common.weekday.short.${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type WeekdayFullKey = `common.weekday.full.${0 | 1 | 2 | 3 | 4 | 5 | 6}`;

const WEEKDAY_PLURAL_KEYS: readonly WeekdayPluralKey[] = [
  "common.weekday.plural.0",
  "common.weekday.plural.1",
  "common.weekday.plural.2",
  "common.weekday.plural.3",
  "common.weekday.plural.4",
  "common.weekday.plural.5",
  "common.weekday.plural.6",
] as const;

export function weekdayPluralKey(d: number): WeekdayPluralKey {
  const key = WEEKDAY_PLURAL_KEYS[d];
  if (!key) throw new Error(`dia da semana inválido: ${d}`);
  return key;
}

const WEEKDAY_SHORT_KEYS: readonly WeekdayShortKey[] = [
  "common.weekday.short.0",
  "common.weekday.short.1",
  "common.weekday.short.2",
  "common.weekday.short.3",
  "common.weekday.short.4",
  "common.weekday.short.5",
  "common.weekday.short.6",
] as const;

export function weekdayShortKey(d: number): WeekdayShortKey {
  const key = WEEKDAY_SHORT_KEYS[d];
  if (!key) throw new Error(`dia da semana inválido: ${d}`);
  return key;
}

const WEEKDAY_FULL_KEYS: readonly WeekdayFullKey[] = [
  "common.weekday.full.0",
  "common.weekday.full.1",
  "common.weekday.full.2",
  "common.weekday.full.3",
  "common.weekday.full.4",
  "common.weekday.full.5",
  "common.weekday.full.6",
] as const;

export function weekdayFullKey(d: number): WeekdayFullKey {
  const key = WEEKDAY_FULL_KEYS[d];
  if (!key) throw new Error(`dia da semana inválido: ${d}`);
  return key;
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** 1. Atalhos do "Repetir" para uma dada data de serviço. */
export function repeatPresets(serviceDate: string): Record<Exclude<RepeatPresetKind, "custom">, RepeatPreset> {
  const dow = dayOfWeek(serviceDate);
  return {
    once: { kind: "once", weekdays: [], onceDate: serviceDate },
    daily: { kind: "daily", weekdays: [...ALL_WEEKDAYS], onceDate: null },
    weekdays: { kind: "weekdays", weekdays: [...WORK_WEEKDAYS], onceDate: null },
    weekly: { kind: "weekly", weekdays: [dow], onceDate: null },
  };
}

/** Identifica qual atalho corresponde aos dias atuais. */
export function presetOf(
  weekdays: readonly number[],
  onceDate: string | null,
  serviceDate?: string,
): RepeatPresetKind {
  if (weekdays.length === 0) return "once";
  if (sameDays(weekdays, ALL_WEEKDAYS)) return "daily";
  if (sameDays(weekdays, WORK_WEEKDAYS)) return "weekdays";
  if (weekdays.length === 1) {
    if (!serviceDate || weekdays[0] === dayOfWeek(serviceDate)) return "weekly";
    return "custom";
  }
  return "custom";
}

/** Formata data YYYY-MM-DD em DD/MM. */
export function shortDateText(date: string): string {
  const parts = date.split("-");
  if (parts.length < 3) return date;
  return `${parts[2]}/${parts[1]}`;
}

/** 2. Resumo curto do aviso a partir de weekdays e validTo. */
export function alarmSummary(weekdays: readonly number[], validTo: string | null): string {
  let text: string;
  if (weekdays.length === 0) {
    text = t("alarm.summary.once");
  } else if (sameDays(weekdays, ALL_WEEKDAYS)) {
    text = t("alarm.summary.daily");
  } else if (sameDays(weekdays, WORK_WEEKDAYS)) {
    text = t("alarm.summary.weekdays");
  } else {
    // Dias separados por espaço na ordem seg a dom
    const active = new Set(weekdays);
    const names = WEEKDAY_ORDER.filter((d) => active.has(d)).map((d) =>
      t(weekdayShortKey(d)),
    );
    text = names.join(" ");
  }

  if (validTo !== null && weekdays.length > 0) {
    const until = t("alarm.summary.until", { date: shortDateText(validTo) });
    return `${text} · ${until}`;
  }
  return text;
}

/** Linha da lista de Ajustes (plano §3.1): "Facul · L1 · sair ~07:59 · seg qua sex · até 31/01". */
export function alarmLine(
  alarm: { weekdays: readonly number[]; validTo: string | null },
  meta: { placeName: string; lineCode: string; leaveTime: string },
): string {
  const summary = alarmSummary(alarm.weekdays, alarm.validTo);
  const leave = t("alarms.line.leave", { time: meta.leaveTime });
  return `${meta.placeName} · ${meta.lineCode} · ${leave} · ${summary}`;
}

/** 3. Montar o aviso a partir do cartão. */
export function alarmFromCard(
  card: { optionId: string; tripId: string },
  trip: TripData,
  boardPosition: number,
  serviceDate: string,
): NewAlarm {
  const base = baseTimeAt(trip, boardPosition);
  if (!base) {
    throw new Error(`viagem ${trip.id} sem horário-base no embarque ${boardPosition}`);
  }
  return {
    optionId: card.optionId,
    anchorTripId: card.tripId,
    anchorBaseMinute: base.minute,
    validFrom: serviceDate,
    validTo: null,
    enabled: true,
    weekdays: [],
    onceDate: serviceDate,
  };
}

/**
 * Recria o aviso para o Desfazer do cancelamento (E-06 Item 0):
 * descarta o id e os campos da linha (createdAt, updatedAt, deletedAt, source) e mantém os campos de regra.
 */
export function alarmFromRow(row: AlarmRow): NewAlarm {
  return {
    optionId: row.optionId,
    anchorTripId: row.anchorTripId,
    anchorBaseMinute: row.anchorBaseMinute,
    weekdays: [...row.weekdays],
    onceDate: row.onceDate,
    validFrom: row.validFrom,
    validTo: row.validTo,
    enabled: row.enabled,
  };
}

/** 4. O cartão tem aviso ligado com o mesmo horário-base? */
export function alarmOfCard<T extends { enabled: boolean; optionId: string; anchorBaseMinute: number }>(
  card: { optionId: string; tripId?: string },
  alarms: readonly T[],
  tripOrBase: TripData | number,
  boardPosition?: number,
): T | undefined {
  const baseMinute =
    typeof tripOrBase === "number"
      ? tripOrBase
      : boardPosition !== undefined
      ? baseTimeAt(tripOrBase, boardPosition)?.minute
      : undefined;
  if (baseMinute === undefined) return undefined;
  return alarms.find(
    (a) => a.enabled && a.optionId === card.optionId && a.anchorBaseMinute === baseMinute,
  );
}

export interface UpcomingItem {
  id: string;
  at: number;
  time: string;
  text: string;
}

/** 5. Próximos avisos a partir dos agendados na porta. */
export function upcomingList(scheduled: readonly ScheduledRequest[]): UpcomingItem[] {
  return scheduled
    .filter((r) => {
      if (r.categoryId !== DEPARTURE_CATEGORY && r.categoryId !== "departure") return false;
      if (r.id.startsWith("test:")) return false;
      if (r.id.endsWith(":snooze")) return false;
      const data = r.data;
      if (data?.test === true) return false;
      return true;
    })
    .sort((a, b) => a.at - b.at)
    .slice(0, 10)
    .map((r) => {
      const dep = r.data ? readDeparture(r.data) : null;
      const lineCode = dep?.lineCode ?? (typeof r.data?.lineCode === "string" ? r.data.lineCode : "");
      const stopName = dep?.stopName ?? (typeof r.data?.stopName === "string" ? r.data.stopName : "");
      const min = lisbonWallClock(r.at).minute;
      return {
        id: r.id,
        at: r.at,
        time: formatServiceMinute(min),
        text: `${lineCode} · ${stopName}`,
      };
    });
}

export function skipReasonText(reason: SkipReason): string {
  switch (reason) {
    case "holiday":
      return t("alarm.history.reason.holiday");
    case "override":
      return t("alarm.history.reason.override");
    case "no_trip":
      return t("alarm.history.reason.no_trip");
    case "season":
      return t("alarm.history.reason.season");
  }
}

export function alarmEventLabel(state: AlarmEventState, skipReason: SkipReason | null): string {
  switch (state) {
    case "boarded":
      return t("alarm.history.boarded");
    case "snoozed":
      return t("alarm.history.snoozed");
    case "dismissed":
      return t("alarm.history.dismissed");
    case "delivered":
      return t("alarm.history.delivered");
    case "unconfirmed":
      return t("alarm.history.unconfirmed");
    case "scheduled":
      return t("alarm.history.scheduled");
    case "skipped":
      return t("alarm.history.skipped", { reason: skipReason ? skipReasonText(skipReason) : "" });
  }
}

export interface HistoryItem {
  id: string;
  plannedAt: number;
  serviceDate: string;
  state: AlarmEventState;
  skipReason: SkipReason | null;
  statusLabel: string;
  time: string;
}

/** 6. Histórico das linhas de alarm_event, mais novas primeiro, máx 30. */
export function historyList(events: readonly AlarmEventRow[]): HistoryItem[] {
  return [...events]
    .sort((a, b) => b.plannedAt - a.plannedAt)
    .slice(0, 30)
    .map((e) => {
      const min = lisbonWallClock(e.plannedAt).minute;
      return {
        id: e.id,
        plannedAt: e.plannedAt,
        serviceDate: e.serviceDate,
        state: e.state,
        skipReason: e.skipReason,
        statusLabel: alarmEventLabel(e.state, e.skipReason),
        time: formatServiceMinute(min),
      };
    });
}

/** Traduz um pendingIntent do corpo da notificação em folha a empilhar. */
export function sheetOfPendingIntent(
  intent: { kind: string; [key: string]: unknown } | null,
): { kind: "goto"; destinationPlaceId: string } | null {
  if (intent?.kind === "goto" && typeof intent.placeId === "string") {
    return { kind: "goto", destinationPlaceId: intent.placeId };
  }
  return null;
}

/** Transição de atalhos. */
export function applyPreset(
  preset: RepeatPresetKind,
  serviceDate: string,
): { weekdays: number[]; onceDate: string | null } {
  if (preset === "once") return { weekdays: [], onceDate: serviceDate };
  if (preset === "daily") return { weekdays: [...ALL_WEEKDAYS], onceDate: null };
  if (preset === "weekdays") return { weekdays: [...WORK_WEEKDAYS], onceDate: null };
  if (preset === "weekly") return { weekdays: [dayOfWeek(serviceDate)], onceDate: null };
  return { weekdays: [], onceDate: null };
}

/** Alternar dia na repetição personalizada. Desmarcar todos volta a 'once'. */
export function toggleWeekday(
  weekdays: readonly number[],
  day: number,
  serviceDate: string,
): { weekdays: number[]; onceDate: string | null } {
  const current = new Set(weekdays);
  if (current.has(day)) {
    current.delete(day);
  } else {
    current.add(day);
  }
  if (current.size === 0) {
    return { weekdays: [], onceDate: serviceDate };
  }
  const ordered = WEEKDAY_ORDER.filter((d) => current.has(d));
  return { weekdays: ordered, onceDate: null };
}

/** Transição do seletor "Até": "none" (sem fim) grava null, "date" grava a data ISO. */
export function applyUntil(mode: "none" | "date", selectedDate: string | null): string | null {
  return mode === "none" ? null : selectedDate;
}

/** Orientação do modo foco só aparece no primeiro aviso ligado (flag não gravada). */
export function shouldShowFocusHint(flag: boolean | null | undefined): boolean {
  return flag !== true;
}

export interface AskController {
  wait: () => Promise<boolean>;
  resolve: (value: boolean) => void;
}

/** Controlador para o ask de permissão (resolve uma única vez, nunca pendura). */
export function createAskController(): AskController {
  let settled = false;
  let resolver: ((value: boolean) => void) | undefined;
  const promise = new Promise<boolean>((res) => {
    resolver = res;
  });

  return {
    wait: () => promise,
    resolve: (value: boolean) => {
      if (settled) return;
      settled = true;
      resolver?.(value);
    },
  };
}
