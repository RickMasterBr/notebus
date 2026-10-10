/**
 * Consultas só de leitura para o calendário (TL-12, E-08 bloco 1b, Item 4.5).
 * Apenas linhas vivas (selectLive).
 */
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { DayTypeCode } from "@notebus/domain";
import { selectLive } from "./query";
import { dateOverride, dayType, holiday, type Source } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface CalendarOverrideItem {
  id: string;
  date: string;
  dayTypeCode: DayTypeCode;
  note: string | null;
  source: Source;
}

export interface CalendarHolidayItem {
  id: string;
  date: string;
  name: string;
  scope: "national" | "municipal" | "manual";
  recurring: boolean;
}

export async function listOverrides(db: AnyDb): Promise<CalendarOverrideItem[]> {
  const [overrides, dayTypes] = await Promise.all([
    selectLive(db, dateOverride),
    selectLive(db, dayType),
  ]);

  const codeById = new Map<string, DayTypeCode>();
  for (const dt of dayTypes) {
    codeById.set(dt.id, dt.code as DayTypeCode);
  }

  return overrides.map((row) => ({
    id: row.id,
    date: row.date,
    dayTypeCode: codeById.get(row.dayTypeId) ?? ("weekday" as DayTypeCode),
    note: row.note ?? null,
    source: row.source,
  }));
}

export async function listHolidays(db: AnyDb): Promise<CalendarHolidayItem[]> {
  const holidays = await selectLive(db, holiday);

  return holidays.map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    scope: row.scope,
    recurring: Boolean(row.recurring),
  }));
}
