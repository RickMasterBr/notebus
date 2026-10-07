/**
 * Os estados do histórico (E-06 §6, T-58, D-103), lado do app. Ao abrir o app e ao voltar do segundo plano: para cada saída
 * que já venceu e **não** tem ação gravada, `delivered` se o aviso ainda está na central de notificações, `unconfirmed` se
 * não está (o app não distingue "apagou sem tocar" de "não tocou"). Estado final (ação gravada, `skipped`) nunca regride.
 */
import { resolveAlarmEventState } from "@notebus/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { sharedAlarms } from "../db/alarms";
import type { NotificationsPort } from "./port";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export async function syncAlarmEvents(port: NotificationsPort, db: AnyDb, now: number): Promise<void> {
  const repo = sharedAlarms(db);
  const inTray = new Set((await port.listPresented()).map((p) => p.id));
  for (const event of await repo.listEvents()) {
    if (event.actedAt !== null || event.state === "skipped" || event.plannedAt > now) continue;
    const { state } = resolveAlarmEventState({
      plannedAt: event.plannedAt,
      now,
      action: null,
      inTray: inTray.has(event.id),
      skipReason: event.skipReason,
    });
    if (state !== event.state) await repo.updateEvent(event.id, { state }, now);
  }
}
