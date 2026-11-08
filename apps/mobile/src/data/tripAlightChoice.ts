/**
 * A descida escolhida pelo passageiro (D-393): guardada no aparelho, por viagem, na tabela `setting` com a chave
 * `trip_alight_choice`. Fica fora do backup de propósito: o backup só leva as chaves de `BACKUP_SETTING_KEYS`
 * (`db/backup.ts`) e esta não está lá.
 *
 * O valor tem a viagem (`rideId`) e a posição escolhida: ao abrir outra viagem a escolha antiga não vale. Quem usa
 * o hook vê a escolha mudar sem recarregar a tela (a lista de ouvintes vive no módulo, como em
 * `notifications/pendingIntent.ts`).
 */
import { useEffect, useCallback, useSyncExternalStore } from "react";
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { uuidv7 } from "@notebus/domain";
import { getSharedDb } from "../db/sharedDb";
import { selectLive } from "../db/query";
import { setting } from "../db/schema";
import { realNow } from "./clock";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const TRIP_ALIGHT_CHOICE = "trip_alight_choice";

export interface TripAlightChoice {
  /** A viagem a que a escolha pertence. */
  rideId: string;
  /** A posição da paragem de descida no percurso. */
  position: number;
}

/** Lê a descida escolhida. Valor ausente ou inválido vale `null` (como `readLastMapPosition`). */
export async function readTripAlightChoice(db: AnyDb): Promise<TripAlightChoice | null> {
  const rows = await selectLive(db, setting, eq(setting.key, TRIP_ALIGHT_CHOICE)).limit(1);
  const row = rows[0];
  if (!row) return null;
  let raw: unknown = row.value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { rideId, position } = raw as Record<string, unknown>;
  if (typeof rideId !== "string") return null;
  if (typeof position !== "number" || !Number.isInteger(position)) return null;
  return { rideId, position };
}

/** Grava a descida escolhida na tabela `setting` (ou grava `null` para a apagar), como o resto do `setting`. */
export async function writeTripAlightChoice(
  db: AnyDb,
  value: TripAlightChoice | null,
  now: number,
): Promise<void> {
  // A coluna `value` é "not null": um `null` do JS iria como SQL NULL e seria recusado. O texto `null` é o JSON
  // que a coluna json lê de volta como `null` (D-393: apagar a escolha grava `null`, não apaga a linha).
  const encoded = value === null ? sql`${"null"}` : value;
  await db
    .insert(setting)
    .values({
      id: uuidv7(now),
      createdAt: now,
      updatedAt: now,
      source: "user",
      key: TRIP_ALIGHT_CHOICE,
      value: encoded,
    })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: encoded, updatedAt: now, deletedAt: null },
    });
}

/** A posição guardada, só se a viagem guardada for a aberta; senão `null`. */
export function choiceFor(stored: TripAlightChoice | null, openRideId: string | null): number | null {
  if (stored === null || openRideId === null) return null;
  return stored.rideId === openRideId ? stored.position : null;
}

/** A escolha guardada, num valor de módulo: todos os hook leem o mesmo. */
let stored: TripAlightChoice | null = null;
let loadStarted = false;
const listeners = new Set<() => void>();

/** Avisa, sem mudar nada, todos os que usam o hook (o `useSyncExternalStore` volta a ler o valor). */
function publish(value: TripAlightChoice | null): void {
  stored = value;
  for (const listener of [...listeners]) listener();
}

/** Ouve as mudanças da escolha. Devolve o `remove`. */
export function onTripAlightChoiceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** O valor que o hook mostra (valor estável enquanto a escolha não muda, como o `useSyncExternalStore` exige). */
export function tripAlightChoiceSnapshot(): TripAlightChoice | null {
  return stored;
}

/** Lê a escolha do banco compartilhado uma vez por sessão e avisa quem espera. */
export async function loadTripAlightChoice(db: AnyDb): Promise<void> {
  if (loadStarted) return;
  loadStarted = true;
  publish(await readTripAlightChoice(db));
}

/**
 * Grava uma escolha (ou `null`, que a apaga): guarda no módulo, avisa todos os ouvintes e grava no banco.
 * Sem viagem aberta ou sem banco não grava nada — mas o valor de módulo só muda com uma viagem aberta.
 */
export async function chooseTripAlightChoice(
  db: AnyDb | null,
  openRideId: string | null,
  position: number | null,
  now: number,
): Promise<void> {
  if (openRideId === null) return;
  const value: TripAlightChoice | null = position === null ? null : { rideId: openRideId, position };
  publish(value);
  if (db !== null) await writeTripAlightChoice(db, value, now);
}

/**
 * A descida escolhida da viagem aberta, com a escolha a acompanhar o que estiver gravado. `choose` grava
 * e avisa todos os que usam o hook; a gravação no banco segue sem bloquear a tela.
 */
export function useTripAlightChoice(openRideId: string | null): {
  position: number | null;
  choose(position: number | null): void;
} {
  const storedChoice = useSyncExternalStore(onTripAlightChoiceChange, tripAlightChoiceSnapshot);
  useEffect(() => {
    const db = getSharedDb();
    if (db) void loadTripAlightChoice(db);
  }, []);
  const choose = useCallback(
    (position: number | null) => {
      void chooseTripAlightChoice(getSharedDb(), openRideId, position, realNow());
    },
    [openRideId],
  );
  return { position: choiceFor(storedChoice, openRideId), choose };
}
