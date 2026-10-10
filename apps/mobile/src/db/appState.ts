/** Funções para gerenciar o estado global de primeiro uso no banco de dados. */
/**
 * Estado do app guardado no banco: o "primeiro uso" (TL-13). Fica na tabela `setting` (chave/valor JSON).
 */
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { uuidv7, validateLocation, type GeoPoint } from "@notebus/domain";
import { realNow } from "../data/clock";
import { OFFLINE_SNOOZED_UNTIL } from "../data/mapOfflineState";
import { selectLive } from "./query";
import { dataset, setting } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const FIRST_RUN_DONE = "first_run_done";

/**
 * Checa se o usuário ainda precisa passar pela tela de primeiro uso (TL-13).
 * A TL-13 só aparece se o banco ainda não tem dataset importado (nenhuma linha em dataset)
 * e também não tem a flag de "primeiro uso" marcada nas configurações.
 */
export async function needsFirstRun(db: AnyDb): Promise<boolean> {
  const imported = await selectLive(db, dataset).limit(1);
  if (imported.length > 0) return false;
  const marked = await selectLive(db, setting, eq(setting.key, FIRST_RUN_DONE)).limit(1);
  return marked.length === 0;
}

/**
 * Salva no banco de dados a flag indicando que a tela de primeiro uso foi concluída,
 * evitando que ela apareça de novo no futuro.
 */
export async function markFirstRunDone(db: AnyDb, now = realNow()): Promise<void> {
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: FIRST_RUN_DONE, value: true })
    .onConflictDoNothing();
}

export const ALARM_FOCUS_HINT_SHOWN = "alarm_focus_hint_shown";

/** Verifica se a orientação do modo Foco já foi mostrada uma vez (Item 2). */
export async function hasShownAlarmFocusHint(db: AnyDb): Promise<boolean> {
  const marked = await selectLive(db, setting, eq(setting.key, ALARM_FOCUS_HINT_SHOWN)).limit(1);
  return marked.length > 0;
}

/** Grava que a orientação do modo Foco já foi exibida. */
export async function markAlarmFocusHintShown(db: AnyDb, now = realNow()): Promise<void> {
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: ALARM_FOCUS_HINT_SHOWN, value: true })
    .onConflictDoNothing();
}

export const LAST_MAP_POSITION = "last_map_position";

/** Lê a última posição conhecida do mapa da tabela setting. Valor inválido ou ausente vale null. */
export async function readLastMapPosition(db: AnyDb): Promise<GeoPoint | null> {
  const rows = await selectLive(db, setting, eq(setting.key, LAST_MAP_POSITION)).limit(1);
  const row = rows[0];
  if (!row) return null;
  let raw: unknown = row.value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { lat, lon } = raw as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const point: GeoPoint = { lat, lon };
  if (!validateLocation(point, null, "suggested").ok) return null;
  return point;
}

/** Grava a última posição vista do mapa na tabela setting (chave last_map_position). */
export async function writeLastMapPosition(db: AnyDb, point: GeoPoint, now = realNow()): Promise<void> {
  if (!validateLocation(point, null, "suggested").ok) return;
  await db
    .insert(setting)
    .values({
      id: uuidv7(now),
      createdAt: now,
      updatedAt: now,
      source: "user",
      key: LAST_MAP_POSITION,
      value: { lat: point.lat, lon: point.lon },
    })
    .onConflictDoUpdate({
      target: setting.key,
      set: {
        value: { lat: point.lat, lon: point.lon },
        updatedAt: now,
        deletedAt: null,
      },
    });
}

/** Lê o timestamp até o qual o download do mapa offline está em soneca. Nulo se ausente ou inválido. */
export async function readOfflineSnooze(db: AnyDb): Promise<number | null> {
  const rows = await selectLive(db, setting, eq(setting.key, OFFLINE_SNOOZED_UNTIL)).limit(1);
  const row = rows[0];
  if (!row) return null;
  let raw: unknown = row.value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

/** Grava o timestamp de soneca do mapa offline na tabela setting (chave offline_map_snoozed_until). */
export async function writeOfflineSnooze(db: AnyDb, untilMs: number, now = realNow()): Promise<void> {
  if (typeof untilMs !== "number" || !Number.isFinite(untilMs) || untilMs <= 0) return;
  await db
    .insert(setting)
    .values({
      id: uuidv7(now),
      createdAt: now,
      updatedAt: now,
      source: "user",
      key: OFFLINE_SNOOZED_UNTIL,
      value: untilMs,
    })
    .onConflictDoUpdate({
      target: setting.key,
      set: {
        value: untilMs,
        updatedAt: now,
        deletedAt: null,
      },
    });
}

