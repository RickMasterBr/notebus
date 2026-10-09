/**
 * Localização dos pontos em memória (E-07 §3.2 e §3.4). O índice de busca (`StopEntry`) e o `ScheduleSnapshot` não
 * carregam `lat/lon`; aqui ficam só os pontos vivos que **têm** as duas coordenadas, mais de onde a coordenada veio.
 */
import { and, isNotNull } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { selectLive } from "../db/query";
import { stop } from "../db/schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface StopLocation {
  id: string;
  lat: number;
  lon: number;
  source: "manual" | "suggested" | null;
}

export async function loadStopLocations(db: AnyDb): Promise<StopLocation[]> {
  const rows = await selectLive(db, stop, and(isNotNull(stop.lat), isNotNull(stop.lon)));
  return rows.flatMap((r) => (r.lat !== null && r.lon !== null ? [{ id: r.id, lat: r.lat, lon: r.lon, source: r.locationSource }] : []));
}
