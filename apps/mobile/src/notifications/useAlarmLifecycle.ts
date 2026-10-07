/**
 * Ao abrir o app e ao voltar do segundo plano (E-06 §3.2, §6): sincroniza os estados do histórico com a central de
 * notificações e reagenda a janela, com o relógio real. Nunca atrasa a abertura da tela: tudo roda solto e erro vira log.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { realNow } from "../data/clock";
import type { getSharedDb } from "../db/sharedDb";
import { expoPort } from "./expoPort";
import { requestReschedule } from "./runtime";
import { syncAlarmEvents } from "./syncEvents";

type Db = NonNullable<ReturnType<typeof getSharedDb>>;

export function useAlarmLifecycle(db: Db | null, enabled: boolean): void {
  useEffect(() => {
    if (!db || !enabled) return;
    const run = () => {
      syncAlarmEvents(expoPort, db, realNow())
        .catch((error) => console.warn("[notificações] histórico", error))
        .finally(requestReschedule);
    };
    run();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") run();
    });
    return () => sub.remove();
  }, [db, enabled]);
}
