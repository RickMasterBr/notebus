/**
 * Criação de ponto e Desfazer (E-08 §5.4, bloco 7, Item 1).
 * O ponto nasce `source = "user"` e sem chave oficial. A localização, se vier (D-184), entra no mesmo INSERT, com o mesmo `updatedAt`:
 * gravar depois com `saveStopLocation` mudaria o `updatedAt` e o Desfazer responderia `stale`.
 * O Desfazer apaga logicamente, e só se ninguém mexeu no ponto desde a criação.
 */
import { uuidv7, validateLocation } from "@notebus/domain";
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
import type { StopPoint } from "./stopLocation";
import { externalIdTaken } from "./stopRules";

/** Valores do "Novo ponto": os da edição e, opcionalmente, o lugar no mapa. */
export type NewStopValues = StopEditValues & { location?: StopPoint | null };

export type CreateStopRefusal = "invalid" | "duplicate_external_id" | "no_network";

export type CreateStopResult =
  | { ok: true; id: string; undo: StopEditUndo }
  | { ok: false; reason: CreateStopRefusal };

export async function createStop(
  db: AnyDb,
  value: NewStopValues,
  nowMs: number,
  deps: { newId?: (now: number) => string } = {},
): Promise<CreateStopResult> {
  const name = value.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid" };

  const note = value.note?.trim() || null;
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, reason: "invalid" };

  const externalId = value.externalId?.trim() || null;
  if (externalIdTooLong(externalId, null)) return { ok: false, reason: "invalid" };

  const location = value.location ?? null;
  if (location !== null && !validateLocation(location, null, "suggested").ok) return { ok: false, reason: "invalid" };

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
      lat: location?.lat ?? null,
      lon: location?.lon ?? null,
      locationSource: location === null ? null : "manual",
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
