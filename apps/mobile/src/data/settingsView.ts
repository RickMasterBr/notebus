/**
 * Lógica pura da tela de Ajustes (TL-12, E-08 Bloco 1b).
 * Sem React nem relógio do aparelho: todas as funções que precisam de instante recebem como argumento.
 */
import { clampMargin, lisbonWallClock, type DayTypeCode } from "@notebus/domain";
import { type MessageKey, t } from "../i18n";
import type { ScheduleSnapshot } from "./schedule";
import { dateNumbers, weekdayName } from "./testClockPicker";

export interface BackupDaysResult {
  key: "settings.backup.never" | "settings.backup.today" | "settings.backup.yesterday" | "settings.backup.days_ago";
  params?: { n: number };
  text: string;
}

/**
 * 1. backupDaysText: devolve a chave, parâmetros e texto traduzido do último backup por calendário de Lisboa.
 */
export function backupDaysText(lastExportAt: number | null, nowMs: number): BackupDaysResult {
  if (lastExportAt === null) {
    return { key: "settings.backup.never", text: t("settings.backup.never") };
  }
  const today = lisbonWallClock(nowMs).date;
  const exportDay = lisbonWallClock(lastExportAt).date;

  const toDays = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
  const diff = toDays(today) - toDays(exportDay);

  if (diff <= 0) {
    return { key: "settings.backup.today", text: t("settings.backup.today") };
  }
  if (diff === 1) {
    return { key: "settings.backup.yesterday", text: t("settings.backup.yesterday") };
  }
  return {
    key: "settings.backup.days_ago",
    params: { n: diff },
    text: t("settings.backup.days_ago", { n: diff }),
  };
}

export interface StepMarginResult {
  value: number;
  atMin: boolean;
  atMax: boolean;
}

export function marginLimits(margin: number): { atMin: boolean; atMax: boolean } {
  return { atMin: margin <= 0, atMax: margin >= 10 };
}

/**
 * 2. stepMargin: soma ou subtrai 1 e limita a 0 a 10 usando clampMargin.
 */
export function stepMargin(current: number, direction: 1 | -1): StepMarginResult {
  const value = clampMargin(current + direction);
  return { value, atMin: value <= 0, atMax: value >= 10 };
}

export interface SplitOverridesResult<T> {
  upcoming: T[];
  past: T[];
  pastCount: number;
}

/**
 * 3. splitOverrides: futuras e de hoje (crescente) e passadas (decrescente).
 */
export function splitOverrides<T extends { date: string }>(
  rows: readonly T[],
  todayLisbon: string,
): SplitOverridesResult<T> {
  const upcoming = rows
    .filter((r) => r.date >= todayLisbon)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = rows
    .filter((r) => r.date < todayLisbon)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    upcoming,
    past,
    pastCount: past.length,
  };
}

export interface DayTypeCounts {
  weekday: number;
  saturday: number;
  sunday_holiday: number;
}

/**
 * 4. dayTypeCounts: viagens por tipo de dia a partir de trips do snapshot.
 */
export function dayTypeCounts(snapshot: ScheduleSnapshot | null | undefined): DayTypeCounts {
  const counts: DayTypeCounts = { weekday: 0, saturday: 0, sunday_holiday: 0 };
  if (!snapshot?.schedule?.trips) return counts;
  for (const trip of snapshot.schedule.trips) {
    if (trip.deletedAt) continue;
    for (const dt of trip.dayTypes) {
      if (dt in counts) counts[dt as keyof DayTypeCounts]++;
    }
  }
  return counts;
}

/**
 * 5. networkLine: texto MOBILIS Leiria · dados de {{version}} · vigência desde {{validFrom}}.
 */
export function networkLine(
  dataset?: { version: string; validFrom?: string | null } | null,
  network?: { name: string } | null,
): string | null {
  if (!dataset) return null;
  const networkName = network?.name ?? "MOBILIS Leiria";
  if (dataset.validFrom) {
    const formattedFrom = dataset.validFrom.includes("-") ? dateNumbers(dataset.validFrom) : dataset.validFrom;
    return t("settings.network.line", { version: dataset.version, from: formattedFrom });
  }
  return `${networkName} · dados de ${dataset.version}`;
}

/**
 * 6. Formatadores reutilizando weekdayName e dateNumbers de testClockPicker.ts.
 */
export function formatOverrideDate(date: string): string {
  return `${dateNumbers(date)} ${weekdayName(date)}`;
}

export function formatOverrideLine(date: string, dayTypeCode: DayTypeCode): string {
  const typeLabel = t(`settings.day.${dayTypeCode}` as MessageKey);
  return `${formatOverrideDate(date)} · ${typeLabel}`;
}

export function formatHolidayLine(name: string, date: string, recurring: boolean): string {
  if (recurring) {
    const monthDay = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    return t("settings.holiday.line_every_year", { name, date: monthDay });
  }
  return t("settings.holiday.line_once", { name, date: dateNumbers(date) });
}
