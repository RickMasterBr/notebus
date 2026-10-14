/**
 * Persistência do nome do usuário no setting (E-08.5 Bloco 15, D-203, D-204).
 * Fica exclusivamente no aparelho local e fora do backup.
 */
import { uuidv7 } from "@notebus/domain";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { normalizeUserName } from "../data/settingsIndex";
import { selectLive } from "./query";
import { setting } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const USER_NAME_KEY = "user_name";

export async function readUserName(db: AnyDb): Promise<string | null> {
  const rows = await selectLive(db, setting, eq(setting.key, USER_NAME_KEY)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return typeof row.value === "string" ? row.value : null;
}

export async function clearUserName(db: AnyDb, now: number): Promise<void> {
  const existing = (await db.select().from(setting).where(eq(setting.key, USER_NAME_KEY)))[0];
  if (existing) {
    await db
      .update(setting)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(setting.id, existing.id));
  }
}

export async function writeUserName(
  db: AnyDb,
  name: string | null | undefined,
  now: number,
  newId: (at: number) => string = uuidv7,
): Promise<void> {
  const normalized = normalizeUserName(name);
  if (!normalized) {
    await clearUserName(db, now);
    return;
  }
  const existing = (await db.select().from(setting).where(eq(setting.key, USER_NAME_KEY)))[0];
  if (existing) {
    await db
      .update(setting)
      .set({ value: normalized, updatedAt: now, deletedAt: null })
      .where(eq(setting.id, existing.id));
    return;
  }
  await db.insert(setting).values({
    id: newId(now),
    key: USER_NAME_KEY,
    value: normalized,
    source: "user",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}
