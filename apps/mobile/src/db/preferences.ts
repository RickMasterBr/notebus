/**
 * Preferências do usuário no `setting` (E-08 §3.1, §3.3, §3.4, D-019, D-114): a margem do "esteja no ponto às", os feriados
 * municipais e o interruptor dos avisos de saída. Estas três chaves vão e voltam no backup (`BACKUP_SETTING_KEYS`).
 *
 * Só lê e grava: a fila de gravação, a recarga dos horários e o reagendamento dos avisos são de quem chama
 * (`data/preferences.ts`). Quem precisa de relógio recebe o `at` (epoch ms) como argumento.
 */
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { DOMAIN_CONFIG, MAX_MARGIN_MINUTES, clampMargin, uuidv7 } from "@notebus/domain";
import { selectLive } from "./query";
import { setting } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const MARGIN_KEY = "margin_minutes";
export const INCLUDE_MUNICIPAL_KEY = "include_municipal_holidays";
export const ALARMS_ALLOWED_KEY = "alarms_allowed";

export interface Preferences {
  /** Minutos antes do início da faixa para estar no ponto: inteiro de 0 a 10. */
  margin: number;
  includeMunicipalHolidays: boolean;
  alarmsAllowed: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  margin: DOMAIN_CONFIG.marginMinutes,
  includeMunicipalHolidays: true,
  alarmsAllowed: true,
});

/** A margem que o app oferece: inteiro de 0 a 10. É o guarda de dados do setter (a tela só oferece 0 a 10). */
export const isValidMargin = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MARGIN_MINUTES;

export async function readPreferences(db: AnyDb): Promise<Preferences> {
  const rows = await selectLive(db, setting);
  const valueOf = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    margin: clampMargin(valueOf(MARGIN_KEY)),
    includeMunicipalHolidays: valueOf(INCLUDE_MUNICIPAL_KEY) !== false,
    alarmsAllowed: valueOf(ALARMS_ALLOWED_KEY) !== false,
  };
}

/** Grava (ou troca) uma chave. Uma linha apagada com a mesma chave volta a valer (a chave é única no banco). */
export async function writePreference(
  db: AnyDb,
  key: string,
  value: number | boolean,
  at: number,
  newId: (at: number) => string = uuidv7,
): Promise<void> {
  const existing = (await db.select().from(setting).where(eq(setting.key, key)))[0];
  if (existing) {
    await db.update(setting).set({ value, updatedAt: at, deletedAt: null }).where(eq(setting.id, existing.id));
    return;
  }
  await db.insert(setting).values({ id: newId(at), key, value, source: "user", createdAt: at, updatedAt: at, deletedAt: null });
}
