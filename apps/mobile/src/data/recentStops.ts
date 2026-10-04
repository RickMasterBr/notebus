/**
 * Últimos pontos abertos (E-02 bloco 3c, D-096/Q-43; até 10, D-144): os 3 primeiros aparecem em "Perto de você", todos na Busca vazia.
 * Ficam na tabela `setting` (chave `recent_stops`, lista de IDs em JSON), sem tabela nem migração nova.
 *
 * Exemplo: abriu A, depois B, depois A de novo → `["A", "B"]` (A volta ao topo, sem repetir).
 */
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { uuidv7 } from "@notebus/domain";
import { selectLive } from "../db/query";
import { setting } from "../db/schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const RECENT_STOPS_KEY = "recent_stops";
/** Guarda até 10 pontos abertos (D-144); o "Perto de você" mostra só os 3 primeiros (`nearbyIds`), a Busca vazia todos. */
export const RECENT_STOPS_MAX = 10;

/** Põe `stopId` no topo, tira a repetição e corta no limite. */
export function pushRecent(list: readonly string[], stopId: string, max = RECENT_STOPS_MAX): string[] {
  return [stopId, ...list.filter((id) => id !== stopId)].slice(0, max);
}

/** O valor gravado pode ter vindo de outra versão ou estar estragado: só entram textos, sem repetir, até o limite. */
function parseList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((v): v is string => typeof v === "string");
  return [...new Set(ids)].slice(0, max);
}

export async function readRecentStops(db: AnyDb, max = RECENT_STOPS_MAX): Promise<string[]> {
  const rows = await selectLive(db, setting, eq(setting.key, RECENT_STOPS_KEY)).limit(1);
  return parseList(rows[0]?.value, max);
}

/** Grava a lista inteira (vazia = "Limpar recentes", D-143; a lista de antes = o Desfazer dele). */
export async function writeRecentStops(db: AnyDb, ids: readonly string[], now: number): Promise<void> {
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: RECENT_STOPS_KEY, value: [...ids] })
    .onConflictDoUpdate({ target: setting.key, set: { value: [...ids], updatedAt: now, deletedAt: null } });
}

/** Grava que o ponto foi aberto e devolve a lista nova (mais recente primeiro). */
export async function rememberStop(db: AnyDb, stopId: string, now: number, max = RECENT_STOPS_MAX): Promise<string[]> {
  const next = pushRecent(await readRecentStops(db, max), stopId, max);
  await writeRecentStops(db, next, now);
  return next;
}
