/**
 * Regras de ponto que a criação e a edição dividem (E-08 §5.1 e §5.4).
 */
import { and, isNotNull, ne } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { selectLive } from "./query";
import { stop } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

/**
 * O ID externo já é de outro ponto vivo? Sem diferenciar maiúsculas; ponto apagado não conta.
 * `exceptStopId` é o ponto que está sendo editado (ele pode manter o próprio ID).
 */
export async function externalIdTaken(
  db: AnyDb,
  externalId: string,
  exceptStopId?: string,
): Promise<boolean> {
  const needle = externalId.trim().toLowerCase();
  const others = await selectLive(
    db,
    stop,
    exceptStopId === undefined
      ? isNotNull(stop.externalId)
      : and(ne(stop.id, exceptStopId), isNotNull(stop.externalId)),
  );
  return others.some((o) => o.externalId && o.externalId.trim().toLowerCase() === needle);
}
