/**
 * Localização do ponto (E-07 §3.1, §3.2): grava e apaga `lat`, `lon` e `location_source` de uma linha de `stop`.
 *
 * Só grava: quem chama (a tela) valida com `validateLocation` e pergunta "Fica longe de Leiria" antes.
 * Ponto oficial que ganha coordenada vira `official_edited`, para a coordenada ir no backup em `official_edits.stop`.
 */
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { stop } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type StopLocationSource = "manual" | "suggested";
export type StopPoint = { lat: number; lon: number };

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

async function liveStop(db: AnyDb, stopId: string) {
  const row = (await db.select().from(stop).where(eq(stop.id, stopId)))[0];
  if (!row || row.deletedAt !== null) throw new Error("ponto não encontrado");
  return row;
}

/** `official` passa a `official_edited`; `user` e `official_edited` ficam como estão. */
const editedSource = (current: "user" | "official" | "official_edited") => (current === "official" ? "official_edited" : current);

export function saveStopLocation(db: AnyDb, stopId: string, point: StopPoint, source: StopLocationSource, nowMs: number): Promise<void> {
  return inTransaction(db, async () => {
    const existing = await liveStop(db, stopId);
    await db
      .update(stop)
      .set({ lat: point.lat, lon: point.lon, locationSource: source, source: editedSource(existing.source), updatedAt: nowMs })
      .where(eq(stop.id, stopId));
  });
}

/** Não volta `official_edited` para `official`: a edição existiu e o backup guarda a linha editada. */
export function clearStopLocation(db: AnyDb, stopId: string, nowMs: number): Promise<void> {
  return inTransaction(db, async () => {
    await liveStop(db, stopId);
    await db.update(stop).set({ lat: null, lon: null, locationSource: null, updatedAt: nowMs }).where(eq(stop.id, stopId));
  });
}
