/**
 * Persistência da última frase do Início no setting (E-08.5 Bloco 17, Item 3, D-207).
 * Fica exclusivamente no aparelho local e fora do backup.
 */
import { uuidv7 } from "@notebus/domain";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { HomePhraseId } from "../data/homePhrase";
import { selectLive } from "./query";
import { setting } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const HOME_LAST_PHRASE_KEY = "home_last_phrase";

const KNOWN_PHRASE_IDS: ReadonlySet<string> = new Set([
  "arriving_minutes",
  "arriving_leave",
  "invite_where",
  "invite_line",
  "invite_faculty_or_home",
  "invite_first_bus",
  "invite_going_home",
  "invite_note_next",
]);

function isHomePhraseId(val: unknown): val is HomePhraseId {
  return typeof val === "string" && KNOWN_PHRASE_IDS.has(val);
}

export async function readLastPhraseId(db: AnyDb): Promise<HomePhraseId | null> {
  const rows = await selectLive(db, setting, eq(setting.key, HOME_LAST_PHRASE_KEY)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return isHomePhraseId(row.value) ? row.value : null;
}

export async function writeLastPhraseId(
  db: AnyDb,
  id: HomePhraseId,
  now: number,
  newId: (at: number) => string = uuidv7,
): Promise<void> {
  const existing = (await db.select().from(setting).where(eq(setting.key, HOME_LAST_PHRASE_KEY)))[0];
  if (existing) {
    await db
      .update(setting)
      .set({ value: id, updatedAt: now, deletedAt: null })
      .where(eq(setting.id, existing.id));
    return;
  }
  await db.insert(setting).values({
    id: newId(now),
    key: HOME_LAST_PHRASE_KEY,
    value: id,
    source: "user",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}
