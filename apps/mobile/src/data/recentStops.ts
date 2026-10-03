/**
 * Últimos pontos abertos (E-02 bloco 3c, D-096/Q-43): os que aparecem em "Perto de você" no Início.
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
/** Até 3 cartões em "Perto de você" (resposta do Rick à pergunta do bloco 3c; a 4.1 §4 só mostra "o ponto sugerido"). */
export const RECENT_STOPS_MAX = 3;

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

/** Grava que o ponto foi aberto e devolve a lista nova (mais recente primeiro). */
export async function rememberStop(db: AnyDb, stopId: string, now: number, max = RECENT_STOPS_MAX): Promise<string[]> {
  const next = pushRecent(await readRecentStops(db, max), stopId, max);
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: RECENT_STOPS_KEY, value: next })
    .onConflictDoUpdate({ target: setting.key, set: { value: next, updatedAt: now, deletedAt: null } });
  return next;
}
