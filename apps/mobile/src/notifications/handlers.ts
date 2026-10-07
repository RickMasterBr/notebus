/**
 * O tratador das respostas do aviso (E-06 §4.2 a §4.4, §5; T-55, T-56). Roda com o app em memória **ou** num despertar em
 * segundo plano sem nenhum Provider do React: por isso fica fora do React e recebe tudo por `deps`.
 *
 * Regras que o resto do bloco depende:
 * - Registrar embarque grava **o fato primeiro** (antes de marcar o evento, de postar a confirmação, de reagendar).
 * - A mesma resposta pode chegar duas vezes (ouvinte e `getLastResponse`); ela vale uma só (ver `alreadyHandled`).
 * - Falha na gravação: não marca o evento, não posta confirmação de sucesso, só registra o erro por log.
 */
import { formatServiceMinute, lisbonWallClock, snoozePlan } from "@notebus/domain";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BoardToken } from "../data/registro";
import type { AlarmEventRow } from "../db/alarms";
import { sharedAlarms } from "../db/alarms";
import { observation } from "../db/schema";
import { t } from "../i18n";
import { ACTION_ADJUST, ACTION_BOARD, ACTION_DISMISS, ACTION_SNOOZE, ACTION_UNDO, BOARD_CONFIRM_CATEGORY, DEPARTURE_CATEGORY } from "./categories";
import { confirmData, readConfirm, readDeparture, type ConfirmPayload, type DeparturePayload } from "./payload";
import { setPendingIntent } from "./pendingIntent";
import { DEFAULT_ACTION, type NotificationResponse, type NotificationsPort } from "./port";
import { departureText, snoozeIdOf } from "./scheduler";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

/** O que o tratador usa do registro (E-03): gravar e desfazer o embarque. */
export interface BoardingStore {
  board(input: { stopId: string; lineId: string; at: number }): Promise<BoardToken>;
  undoBoard(token: BoardToken, at: number): Promise<void>;
}

export interface HandlerDeps {
  port: NotificationsPort;
  /** O banco do app, ou o que o tratador abre sozinho; `null` quando o esquema ainda não existe. */
  getDb: () => Promise<AnyDb | null>;
  /** O relógio real (`realNow`). */
  now: () => number;
  /** O registro sobre o banco (sem dedução: o app a refaz depois). */
  boardingStore: (db: AnyDb) => BoardingStore;
  /** Reagenda a janela (enfileirado pelo agendador). */
  reschedule: (db: AnyDb) => Promise<unknown>;
  log: (message: string, error?: unknown) => void;
}

export const confirmIdOf = (observationId: string) => `confirm:${observationId}`;

export function createResponseHandler(deps: HandlerDeps) {
  const { port } = deps;
  const seen = new Set<string>();

  /**
   * A mesma resposta vale uma só. Na memória: ouvinte e `getLastResponse` na mesma partida. No banco: se o evento já tem
   * ação gravada **depois** de esta notificação ter sido entregue, a ação é a desta resposta (o "Adiar" cria outra
   * notificação, entregue depois, e a ação dela vale de novo).
   */
  function alreadyHandled(response: NotificationResponse, event: AlarmEventRow | null): boolean {
    const key = `${response.notification.id}:${response.actionId}:${response.notification.deliveredAt}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return event !== null && event.actedAt !== null && event.actedAt >= response.notification.deliveredAt;
  }

  async function handle(response: NotificationResponse): Promise<void> {
    try {
      await route(response);
    } catch (error) {
      deps.log("falha ao tratar a resposta da notificação", error);
    } finally {
      await port.clearLastResponse().catch(() => undefined);
    }
  }

  async function route(response: NotificationResponse): Promise<void> {
    const { data } = response.notification;
    if (data.kind === "departure") {
      const departure = readDeparture(data);
      if (!departure) return deps.log("aviso sem os dados esperados");
      return handleDeparture(response, departure);
    }
    if (data.kind === "confirm") {
      const confirm = readConfirm(data);
      if (!confirm) return deps.log("confirmação sem os dados esperados");
      return handleConfirm(response, confirm);
    }
  }

  async function withDb(): Promise<AnyDb | null> {
    const db = await deps.getDb();
    if (!db) deps.log("o esquema do banco ainda não existe: nada foi gravado");
    return db;
  }

  async function handleDeparture(response: NotificationResponse, p: DeparturePayload): Promise<void> {
    if (response.actionId === DEFAULT_ACTION) {
      if (p.placeId) setPendingIntent({ kind: "goto", placeId: p.placeId });
      return;
    }
    const db = await withDb();
    if (!db) return;
    const alarms = sharedAlarms(db);
    const event = await alarms.getEvent(p.eventId);
    if (alreadyHandled(response, event)) return;
    const at = deps.now();
    const mark = async (state: "boarded" | "snoozed" | "dismissed", snoozedTo?: number) => {
      if (event) await alarms.updateEvent(p.eventId, { state, actedAt: at, ...(snoozedTo !== undefined ? { snoozedTo } : {}) }, at);
    };

    if (response.actionId === ACTION_BOARD) {
      // O fato primeiro: nada antes dele, nem a confirmação, nem o reagendamento.
      let token: BoardToken;
      try {
        token = await deps.boardingStore(db).board({ stopId: p.stopId, lineId: p.lineId, at });
      } catch (error) {
        seen.delete(`${response.notification.id}:${response.actionId}:${response.notification.deliveredAt}`);
        return deps.log("o embarque não foi gravado", error);
      }
      await mark("boarded").catch((error) => deps.log("o evento não foi marcado", error));
      await postConfirmation(p, token, at);
      await deps.reschedule(db);
    } else if (response.actionId === ACTION_SNOOZE) {
      const { at: snoozeAt, afterStop } = snoozePlan(at, p.beAtStopAt);
      const text = departureText(p, { afterStop });
      await port.scheduleAt({
        id: snoozeIdOf(p.eventId),
        at: snoozeAt,
        title: text.title,
        body: text.body,
        categoryId: DEPARTURE_CATEGORY,
        data: response.notification.data,
      });
      await mark("snoozed", snoozeAt);
      await deps.reschedule(db);
    } else if (response.actionId === ACTION_DISMISS) {
      await mark("dismissed");
      await deps.reschedule(db);
    }
  }

  /** A confirmação (D-102): o toast não existe fora do app. O `BoardToken` vai no `data`; o processo pode morrer. */
  async function postConfirmation(p: DeparturePayload, token: BoardToken, at: number): Promise<void> {
    try {
      await port.present({
        id: confirmIdOf(token.observationId),
        title: t("toast.board.title"),
        body: t("toast.board.body", { line: p.lineCode, stop_name: p.stopName, time: formatServiceMinute(lisbonWallClock(at).minute) }),
        categoryId: BOARD_CONFIRM_CATEGORY,
        data: confirmData({ eventId: p.eventId, observationId: token.observationId, rideId: token.rideId, reopenedRideIds: token.reopenedRideIds }),
      });
    } catch (error) {
      // O fato está gravado; só a confirmação não saiu.
      deps.log("a confirmação do embarque não saiu", error);
    }
  }

  async function handleConfirm(response: NotificationResponse, c: ConfirmPayload): Promise<void> {
    if (response.actionId === ACTION_ADJUST) {
      setPendingIntent({ kind: "adjust", observationId: c.observationId });
      return;
    }
    if (response.actionId !== ACTION_UNDO) return;
    const db = await withDb();
    if (!db) return;
    if (alreadyHandled(response, null)) return;
    // Desfazer duas vezes reabriria as viagens de novo: o registro que já foi apagado encerra o assunto.
    if (!(await isAlive(db, c.observationId))) return;
    await deps.boardingStore(db).undoBoard({ observationId: c.observationId, rideId: c.rideId, reopenedRideIds: c.reopenedRideIds }, deps.now());
    await port.dismissPresented(confirmIdOf(c.observationId));
    await deps.reschedule(db);
  }

  return { handle };
}

async function isAlive(db: AnyDb, observationId: string): Promise<boolean> {
  const rows = await db.select({ deletedAt: observation.deletedAt }).from(observation).where(eq(observation.id, observationId)).limit(1);
  return rows.length > 0 && rows[0]!.deletedAt === null;
}

export type ResponseHandler = ReturnType<typeof createResponseHandler>;
