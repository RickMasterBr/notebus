/** Transação imediata do SQLite: tudo ou nada, e escrita concorrente espera a vez (E-08, blocos 3 e 7). */
import { sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export async function inTransaction<T>(db: AnyDb, body: () => Promise<T>): Promise<T> {
  await db.run(sql`begin immediate`);
  try {
    const result = await body();
    await db.run(sql`commit`);
    return result;
  } catch (error) {
    await db.run(sql`rollback`).catch(() => undefined);
    throw error;
  }
}
