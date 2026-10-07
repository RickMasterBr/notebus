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

let ownDb: Promise<Db | null> | null = null;

/** O banco do app, se ele já abriu; senão o próprio tratador abre (sem migração) e guarda. */
function getDb(): Promise<Db | null> {
  const shared = getSharedDb();
  if (shared) return Promise.resolve(shared);
  return (ownDb ??= openExistingNotebusDb());
}

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
