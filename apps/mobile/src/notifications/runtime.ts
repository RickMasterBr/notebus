/**
 * A ligação do módulo com o app real (E-06 §3.2, §4): a porta do `expo-notifications`, o relógio real e um agendador por
 * banco. Nada aqui roda nos testes do Node (importa `expoPort`); a lógica está em `scheduler.ts` e `handlers.ts`.
 */
import { formatServiceMinute, lisbonWallClock } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { realNow } from "../data/clock";
import { createRegistro } from "../data/registro";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { selectLive } from "../db/query";
import { line, observation, ride } from "../db/schema";
import { getSharedDb } from "../db/sharedDb";
import { createScheduler, type Scheduler } from "./scheduler";
import { expoPort } from "./expoPort";
import type { BoardingStore } from "./handlers";

type Db = BaseSQLiteDatabase<"sync" | "async", any, any>;

const schedulers = new WeakMap<object, Scheduler>();

export function schedulerFor(db: Db): Scheduler {
  let scheduler = schedulers.get(db);
  if (!scheduler) schedulers.set(db, (scheduler = createScheduler({ port: expoPort, db, now: realNow })));
  return scheduler;
}

const stores = new WeakMap<object, BoardingStore>();

/** O registro sem dedução (`network` e `snapshot` nulos): o `refreshDeductions` do app a refaz depois. */
export function boardingStoreFor(db: Db): BoardingStore {
  let store = stores.get(db);
  if (!store) stores.set(db, (store = createRegistro(db, { network: () => null, snapshot: () => null })));
  return store;
}

/** Consulta se há viagem aberta para o aviso de saída (D-403, D-427). */
export async function hasOpenRideFor(db: Db): Promise<{ lineCode: string; boardedTime: string } | null> {
  const openRides = await selectLive(db, ride, eq(ride.status, "open")).limit(1);
  const open = openRides[0];
  if (!open) return null;
  const obsList = await selectLive(db, observation, eq(observation.id, open.boardingObservationId)).limit(1);
  const obs = obsList[0];
  if (!obs) return null;
  const lines = await selectLive(db, line, eq(line.id, obs.lineId)).limit(1);
  const lineRow = lines[0];
  const lineCode = lineRow ? lineRow.code : obs.lineId;
  const boardedTime = formatServiceMinute(lisbonWallClock(obs.observedAt).minute);
  return { lineCode, boardedTime };
}

/**
 * Pede o reagendamento da janela com o relógio real e **não espera**: nunca atrasa o toque do registro nem a abertura da
 * tela. Sem banco aberto ainda, não faz nada (a abertura do app reagenda).
 */
export function requestReschedule(): void {
  const db = getSharedDb();
  if (!db) return;
  schedulerFor(db)
    .reschedule()
    .catch((error) => console.warn("[notificações] reagendamento falhou", error));
}
