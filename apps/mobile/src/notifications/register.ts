/**
 * Registro dos tratadores no **escopo do módulo** de `index.ts`, antes de `registerRootComponent` (E-06 §4): o iOS acorda o
 * app em segundo plano para entregar o toque num botão, e nesse despertar nenhum Provider do React existe.
 */
import { realNow } from "../data/clock";
import { getSharedDb } from "../db/sharedDb";
import { openExistingNotebusDb } from "../db/open";
import { notificationCategories } from "./categories";
import { expoPort } from "./expoPort";
import { createResponseHandler } from "./handlers";
import { boardingStoreFor, schedulerFor } from "./runtime";

type Db = NonNullable<Awaited<ReturnType<typeof openExistingNotebusDb>>>;

export function createGetDb(
  openExisting: () => Promise<Db | null> = openExistingNotebusDb,
  getShared: () => Db | null = getSharedDb,
) {
  let ownDb: Db | null = null;
  let opening: Promise<Db | null> | null = null;
  return async function getDb(): Promise<Db | null> {
    const shared = getShared();
    if (shared) return shared;
    if (ownDb) return ownDb;
    if (opening) return opening;
    opening = openExisting().then(
      (db) => {
        opening = null;
        if (db) ownDb = db;
        return db;
      },
      (err) => {
        opening = null;
        throw err;
      },
    );
    return opening;
  };
}

const getDb = createGetDb();

export function registerNotificationHandlers(): void {
  const handler = createResponseHandler({
    port: expoPort,
    getDb,
    now: realNow,
    boardingStore: boardingStoreFor,
    reschedule: (db) => schedulerFor(db).reschedule(),
    log: (message, error) => console.warn(`[notificações] ${message}`, error ?? ""),
  });
  expoPort.showInForeground();
  void expoPort.setCategories(notificationCategories()).catch((error) => console.warn("[notificações] categorias", error));
  expoPort.onResponse((response) => void handler.handle(response));
  // Partida a frio: a resposta que acordou o app pode ter chegado antes de o ouvinte existir.
  void expoPort.getLastResponse().then((response) => (response ? handler.handle(response) : undefined));
}
