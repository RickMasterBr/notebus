/** Funções auxiliares para consultas (queries) base no banco de dados filtrando soft delete. */
/**
 * Helper único de consulta (E-01 §4.7, ADR-0002): só devolve linhas não apagadas (`deleted_at IS NULL`).
 * As telas consultam por aqui e nunca filtram `deleted_at` à mão.
 */
import { and, isNull, type SQL } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { tables } from "./schema";

type AnyTable = (typeof tables)[keyof typeof tables];

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

/**
 * Retorna uma query builder já configurada para ignorar linhas com exclusão lógica (`deleted_at`).
 *
 * @param db - Instância do banco drizzle
 * @param table - Tabela do esquema
 * @param where - Condição extra (opcional) a ser combinada com o filtro de `deletedAt`
 * @returns Um objeto Drizzle selecionável/iterável
 */
export function selectLive<T extends AnyTable>(db: AnyDb, table: T, where?: SQL) {
  return db.select().from(table).where(and(isNull(table.deletedAt), where));
}
