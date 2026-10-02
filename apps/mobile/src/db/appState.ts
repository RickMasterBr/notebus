/**
 * Estado do app guardado no banco: o "primeiro uso" (TL-13). Fica na tabela `setting` (chave/valor JSON).
 */
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { uuidv7 } from "@notebus/domain";
import { selectLive } from "./query";
import { dataset, setting } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const FIRST_RUN_DONE = "first_run_done";

/** A TL-13 só aparece se o banco ainda não tem dataset importado nem o primeiro uso marcado. */
export async function needsFirstRun(db: AnyDb): Promise<boolean> {
  const imported = await selectLive(db, dataset).limit(1);
  if (imported.length > 0) return false;
  const marked = await selectLive(db, setting, eq(setting.key, FIRST_RUN_DONE)).limit(1);
  return marked.length === 0;
}

export async function markFirstRunDone(db: AnyDb, now = Date.now()): Promise<void> {
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: FIRST_RUN_DONE, value: true })
    .onConflictDoNothing();
}
