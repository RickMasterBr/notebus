/**
 * Gravação e Desfazer da edição de ponto (E-08 §5.1, D-113, Item 2).
 * Modifica name, aliases, externalId e note de stop.
 * Não toca em lat, lon nem locationSource quando location é undefined (F3, D-190).
 * Ponto official vira official_edited; user e official_edited mantêm o source.
 * updatedAt estritamente crescente.
 */
import { validateLocation } from "@notebus/domain";
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { externalIdTooLong } from "../data/stopEdit";
import { selectLive } from "./query";
import { stop } from "./schema";
import type { StopPoint } from "./stopLocation";
import { externalIdTaken } from "./stopRules";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface StopEditValues {
  name: string;
  aliases: string[];
  externalId: string | null;
  note: string | null;
}

export type StopEditSaveValues = StopEditValues & { location?: StopPoint | null };

export type SaveStopEditRefusal =
  | "not_found"
  | "duplicate_external_id"
  | "invalid";

export type StopEditUndo = (
  nowMs: number,
) => Promise<{ ok: true } | { ok: false; reason: "stale" }>;

export type SaveStopEditResult =
  | { ok: true; undo: StopEditUndo }
  | { ok: false; reason: SaveStopEditRefusal };

async function inTransaction<T>(db: AnyDb, body: () => Promise<T>): Promise<T> {
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

const editedSource = (current: "user" | "official" | "official_edited") =>
  current === "official" ? "official_edited" : current;

export async function saveStopEdit(
  db: AnyDb,
  stopId: string,
  value: StopEditSaveValues,
  nowMs: number,
): Promise<SaveStopEditResult> {
  const nameTrimmed = value.name.trim();
  if (nameTrimmed.length === 0 || nameTrimmed.length > 80) {
    return { ok: false, reason: "invalid" };
  }

  const externalIdTrimmed = value.externalId?.trim() || null;
  const noteTrimmed = value.note?.trim() || null;
  if (noteTrimmed && noteTrimmed.length > 200) {
    return { ok: false, reason: "invalid" };
  }

  if (value.location !== undefined && value.location !== null) {
    if (!validateLocation(value.location, null, "suggested").ok) {
      return { ok: false, reason: "invalid" };
    }
  }

  return inTransaction(db, async () => {
    // 1. Lê o ponto vivo; not_found se sumiu
    const existingList = await selectLive(db, stop, eq(stop.id, stopId));
    const existing = existingList[0];
    if (!existing) {
      return { ok: false, reason: "not_found" };
    }

    // 1b. Limite do ID externo (20), só quando o ID mudou em relação ao que o ponto já tem
    if (externalIdTooLong(externalIdTrimmed, existing.externalId)) {
      return { ok: false, reason: "invalid" };
    }

    // 2. Confere unicidade do externalId contra outros pontos vivos
    if (externalIdTrimmed !== null && (await externalIdTaken(db, externalIdTrimmed, stopId))) {
      return { ok: false, reason: "duplicate_external_id" };
    }

    // 3. Grava name, aliases, externalId, note; source vira official_edited se era official
    const targetUpdatedAt = Math.max(nowMs, existing.updatedAt + 1);
    const newSource = editedSource(existing.source);

    const updateSet: Record<string, unknown> = {
      name: nameTrimmed,
      aliases: value.aliases,
      externalId: externalIdTrimmed,
      note: noteTrimmed,
      source: newSource,
      updatedAt: targetUpdatedAt,
    };

    if (value.location !== undefined) {
      if (value.location === null) {
        updateSet.lat = null;
        updateSet.lon = null;
        updateSet.locationSource = null;
      } else {
        updateSet.lat = value.location.lat;
        updateSet.lon = value.location.lon;
        updateSet.locationSource = "manual";
      }
    }

    await db
      .update(stop)
      .set(updateSet)
      .where(eq(stop.id, stopId));

    // 4. Desfazer: devolve exatamente o estado anterior se updatedAt não mudou
    const undo: StopEditUndo = async (_undoNowMs) => {
      return inTransaction(db, async () => {
        const currentList = await selectLive(db, stop, eq(stop.id, stopId));
        const current = currentList[0];
        if (!current || current.updatedAt !== targetUpdatedAt) {
          return { ok: false, reason: "stale" };
        }

        const undoSet: Record<string, unknown> = {
          name: existing.name,
          aliases: existing.aliases,
          externalId: existing.externalId,
          note: existing.note,
          source: existing.source,
          updatedAt: existing.updatedAt,
        };

        if (value.location !== undefined) {
          undoSet.lat = existing.lat;
          undoSet.lon = existing.lon;
          undoSet.locationSource = existing.locationSource;
        }

        await db
          .update(stop)
          .set(undoSet)
          .where(eq(stop.id, stopId));

        return { ok: true };
      });
    };

    return { ok: true, undo };
  });
}
