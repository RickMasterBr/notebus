/**
 * Criação de ponto e Desfazer (E-08 §5.4, bloco 7, Item 1).
 * O ponto nasce `source = "user"`, sem chave oficial e sem localização (a localização se faz depois, editando).
 * O Desfazer apaga logicamente, e só se ninguém mexeu no ponto desde a criação.
 */
import { uuidv7 } from "@notebus/domain";
import { eq } from "drizzle-orm";
import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  externalIdTooLong,
} from "../data/stopEdit";
import { inTransaction, type AnyDb } from "./inTransaction";
import { selectLive } from "./query";
import { network, stop } from "./schema";
import type { StopEditUndo, StopEditValues } from "./stopEdit";
import { externalIdTaken } from "./stopRules";

export type CreateStopRefusal = "invalid" | "duplicate_external_id" | "no_network";

export type CreateStopResult =
  | { ok: true; id: string; undo: StopEditUndo }
  | { ok: false; reason: CreateStopRefusal };

export async function createStop(
  db: AnyDb,
  value: StopEditValues,
  nowMs: number,
  deps: { newId?: (now: number) => string } = {},
): Promise<CreateStopResult> {
  const name = value.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid" };

  const note = value.note?.trim() || null;
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, reason: "invalid" };

  const externalId = value.externalId?.trim() || null;
  if (externalIdTooLong(externalId, null)) return { ok: false, reason: "invalid" };

  const newId = deps.newId ?? uuidv7;

  return inTransaction(db, async (): Promise<CreateStopResult> => {
    const [liveNetwork] = await selectLive(db, network);
    if (!liveNetwork) return { ok: false, reason: "no_network" };

    if (externalId !== null && (await externalIdTaken(db, externalId))) {
      return { ok: false, reason: "duplicate_external_id" };
    }

    const id = newId(nowMs);
    await db.insert(stop).values({
      id,
      createdAt: nowMs,
      updatedAt: nowMs,
      deletedAt: null,
      source: "user",
      officialKey: null,
      networkId: liveNetwork.id,
      name,
      aliases: value.aliases,
      externalId,
      lat: null,
      lon: null,
      locationSource: null,
      note,
    });

    const undo: StopEditUndo = async (undoNowMs) =>
      inTransaction(db, async () => {
        const [current] = await selectLive(db, stop, eq(stop.id, id));
        if (!current || current.updatedAt !== nowMs) return { ok: false, reason: "stale" };
        const deletedAt = Math.max(undoNowMs, current.updatedAt + 1);
        await db.update(stop).set({ deletedAt, updatedAt: deletedAt }).where(eq(stop.id, id));
        return { ok: true };
      });

    return { ok: true, id, undo };
  });
}
