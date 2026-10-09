/**
 * "Guardar a localização deste ponto" (E-07 §3.2, D-107, T-69): a oferta, a conversão dos registros e a dispensa.
 * A dispensa ("Agora não") fica em `setting` (`stop_location_dismissed`: ponto → id do registro mais recente na hora).
 * É estado do aparelho: a chave **não** está em `BACKUP_SETTING_KEYS`.
 */
import { type GeoPoint, type StopLocationRecord, suggestStopLocation, uuidv7 } from "@notebus/domain";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { selectLive } from "../db/query";
import { setting } from "../db/schema";
import type { ObservationRow } from "./registro";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const STOP_LOCATION_DISMISSED_KEY = "stop_location_dismissed";

export type DismissedMap = Readonly<Record<string, string>>;

/** Os registros de um ponto no formato do domínio; sem `gps_*` vira `gps: null`. */
export function toStopLocationRecords(
  observations: readonly Pick<ObservationRow, "id" | "stopId" | "mode" | "recordedAt" | "gpsLat" | "gpsLon" | "gpsAccuracyM">[],
  stopId: string,
): StopLocationRecord[] {
  return observations
    .filter((o) => o.stopId === stopId)
    .map((o) => ({
      id: o.id,
      mode: o.mode,
      recordedAt: o.recordedAt,
      gps: o.gpsLat !== null && o.gpsLon !== null ? { lat: o.gpsLat, lon: o.gpsLon, accuracyM: o.gpsAccuracyM, atMs: o.recordedAt } : null,
    }));
}

export interface LocationOffer {
  point: GeoPoint;
  count: number;
  /** Do mais recente ao mais antigo; o primeiro é o que a dispensa guarda. */
  recordIds: string[];
  /** A pior precisão entre os registros usados (para a conferência antes de gravar). */
  accuracyM: number | null;
}

export function locationOffer(
  records: readonly StopLocationRecord[],
  stopId: string,
  stopHasLocation: boolean,
  dismissed: DismissedMap,
): LocationOffer | null {
  const found = suggestStopLocation(records, stopHasLocation, dismissed[stopId] ?? null);
  if (!found) return null;
  const used = records.filter((r) => found.recordIds.includes(r.id));
  const accuracies = used.map((r) => r.gps?.accuracyM).filter((a): a is number => typeof a === "number");
  return { point: found.point, count: found.recordIds.length, recordIds: found.recordIds, accuracyM: accuracies.length ? Math.max(...accuracies) : null };
}

function parseDismissed(value: unknown): DismissedMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export async function readDismissed(db: AnyDb): Promise<DismissedMap> {
  const rows = await selectLive(db, setting, eq(setting.key, STOP_LOCATION_DISMISSED_KEY)).limit(1);
  return parseDismissed(rows[0]?.value);
}

export async function writeDismissed(db: AnyDb, map: DismissedMap, now: number): Promise<void> {
  await db
    .insert(setting)
    .values({ id: uuidv7(now), createdAt: now, updatedAt: now, source: "user", key: STOP_LOCATION_DISMISSED_KEY, value: { ...map } })
    .onConflictDoUpdate({ target: setting.key, set: { value: { ...map }, updatedAt: now, deletedAt: null } });
}
