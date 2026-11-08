import { describe, expect, it } from "vitest";
import { createRegistro } from "../data/registro";
import { observation } from "../db/schema";
import { t } from "../i18n";
import { createFakePort } from "./fakePort";
import { createResponseHandler, type BoardingStore } from "./handlers";
import { readDeparture } from "./payload";
import { peekPendingIntent, takePendingIntent } from "./pendingIntent";
import type { NotificationResponse } from "./port";
import { createScheduler } from "./scheduler";
import { WED_0700, schedulerFixture } from "./schedulerFixture";

const TAP = WED_0700 + 600_000; // 07:10
const PLACED_AT = WED_0700;

async function setup(hasOpenRideResult: { lineCode: string; boardedTime: string } | null = null) {
  const fx = await schedulerFixture();
  const port = createFakePort();
  let clock = WED_0700;
  const logs: string[] = [];
  const scheduler = createScheduler({ port, db: fx.db, now: () => clock, loadSchedule: async () => fx.data });
  const store = createRegistro(fx.db, { network: () => null, snapshot: () => null });
  const counts = { board: 0, undo: 0 };

  const boardingStore: BoardingStore = {
    async board(input) {
      port.calls.push("board");
      counts.board++;
      return store.board(input);
    },
    async undoBoard(token, at) {
      port.calls.push("undoBoard");
      counts.undo++;
      return store.undoBoard(token, at);
    },
  };

  const makeHandler = (hasOpenRideFn?: (db: any) => Promise<{ lineCode: string; boardedTime: string } | null>) =>
    createResponseHandler({
      port,
      getDb: async () => fx.db,
      now: () => clock,
      boardingStore: () => boardingStore,
      hasOpenRide: hasOpenRideFn,
      reschedule: async () => {
        port.calls.push("reschedule");
        return scheduler.reschedule();
      },
      log: (message) => void logs.push(message),
    });

  const alarm = await fx.alarmsRepo.createAlarm(fx.newAlarm(), WED_0700);
  await scheduler.reschedule();
  const eventId = `${alarm.id}:2026-10-07`;
  const request = port.scheduled.get(eventId)!;
  port.calls.length = 0;

  const respond = (actionId: string, over: Partial<NotificationResponse["notification"]> = {}): NotificationResponse => ({
    actionId,
    notification: { id: request.id, deliveredAt: PLACED_AT, data: request.data, ...over },
  });

  return {
    ...fx,
    port,
    scheduler,
    handler: makeHandler(async () => hasOpenRideResult),
    makeHandler,
    eventId,
    request,
    respond,
    setNow: (v: number) => (clock = v),
    logs,
    counts,
  };
}

describe("handlersBoardOver (D-403, D-427)", () => {
  it("sem viagem aberta grava como hoje", async () => {
    const s = await setup(null);
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));

    expect(s.counts.board).toBe(1);
    const rows = await s.db.select().from(observation);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("boarded");
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "boarded", actedAt: TAP });
  });

  it("com viagem aberta não grava e apresenta a notificação com a hora do toque", async () => {
    const s = await setup({ lineCode: "L9", boardedTime: "06:50" });
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));

    // Não grava nada
    expect(s.counts.board).toBe(0);
    const rows = await s.db.select().from(observation);
    expect(rows).toHaveLength(0);

    // O estado do alarme permanece inalterado
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "scheduled", actedAt: null });

    // Apresenta notificação de escolha com a hora do toque
    const departure = readDeparture(s.request.data)!;
    const presented = [...s.port.presented.values()];
    expect(presented).toHaveLength(1);
    const notif = presented[0]!;
    expect(notif.title).toBe(t("board_over.notif.title"));
    expect(notif.body).toBe(t("board_over.notif.body", { line: "L9" }));
    expect(notif.data).toEqual({
      kind: "boardOver",
      stopId: departure.stopId,
      lineId: departure.lineId,
      tapAt: TAP,
      eventId: s.eventId,
    });
    // Sem categoria
    expect(notif.categoryId).toBeFalsy();
  });

  it("o toque no corpo da notificação de escolha põe o intento boardOver", async () => {
    takePendingIntent(); // limpa qualquer intento anterior
    const s = await setup(null);
    const response: NotificationResponse = {
      actionId: "default",
      notification: {
        id: "board_over:test-event",
        deliveredAt: TAP,
        data: {
          kind: "boardOver",
          stopId: "stop-arrabalde",
          lineId: "line-1",
          tapAt: TAP,
          eventId: "test-event",
        },
      },
    };

    await s.handler.handle(response);
    const intent = peekPendingIntent();
    expect(intent).toEqual({
      kind: "boardOver",
      stopId: "stop-arrabalde",
      lineId: "line-1",
      tapAt: TAP,
    });
    expect(takePendingIntent()).toEqual(intent);
    expect(peekPendingIntent()).toBeNull();
  });
});
