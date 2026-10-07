import { snoozePlan } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { createRegistro } from "../data/registro";
import { observation, ride } from "../db/schema";
import { t } from "../i18n";
import { createFakePort, type FakePort } from "./fakePort";
import { createResponseHandler, confirmIdOf, type BoardingStore } from "./handlers";
import { readConfirm, readDeparture } from "./payload";
import { peekPendingIntent, takePendingIntent } from "./pendingIntent";
import type { NotificationResponse } from "./port";
import { createScheduler } from "./scheduler";
import { WED_0700, schedulerFixture } from "./schedulerFixture";

// Tratador dos botões (E-06 §4; T-55, T-56): porta e banco falsos. No iPhone real é o A4 (só o aparelho decide).

const TAP = WED_0700 + 600_000; // o toque, 07:10
const PLACED_AT = WED_0700; // o aviso chegou antes do toque

async function setup() {
  const fx = await schedulerFixture();
  const port = createFakePort();
  let clock = WED_0700;
  const logs: string[] = [];
  const scheduler = createScheduler({ port, db: fx.db, now: () => clock, loadSchedule: async () => fx.data });
  const store = createRegistro(fx.db, { network: () => null, snapshot: () => null });
  const counts = { board: 0, undo: 0 };
  let failBoard = false;
  const boardingStore: BoardingStore = {
    async board(input) {
      port.calls.push("board");
      counts.board++;
      if (failBoard) throw new Error("banco indisponível");
      return store.board(input);
    },
    async undoBoard(token, at) {
      port.calls.push("undoBoard");
      counts.undo++;
      return store.undoBoard(token, at);
    },
  };
  const makeHandler = () =>
    createResponseHandler({
      port,
      getDb: async () => fx.db,
      now: () => clock,
      boardingStore: () => boardingStore,
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
  return { ...fx, port, scheduler, handler: makeHandler(), makeHandler, eventId, request, respond, setNow: (v: number) => (clock = v), logs, counts, failBoard: () => (failBoard = true) };
}

const observations = (fx: Awaited<ReturnType<typeof setup>>) => fx.db.select().from(observation);
const callsBefore = (calls: string[], first: string, later: string) => calls.indexOf(first) !== -1 && calls.indexOf(first) < calls.indexOf(later);

describe("T-55: Registrar embarque sem abrir o app", () => {
  it("grava o fato antes de qualquer outra chamada; depois marca o evento, posta a confirmação com o token e reagenda", async () => {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));

    // A ordem das chamadas é verificada: o fato vem antes da confirmação e do reagendamento.
    expect(s.port.calls[0]).toBe("board");
    expect(callsBefore(s.port.calls, "board", `present:${confirmIdOf((await observations(s))[0]!.id)}`)).toBe(true);
    expect(callsBefore(s.port.calls, "board", "reschedule")).toBe(true);
    expect(callsBefore(s.port.calls, "board", "cancelAllScheduled")).toBe(true);

    const rows = await observations(s);
    const departure = readDeparture(s.request.data)!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "boarded", mode: "live", stopId: departure.stopId, lineId: departure.lineId, observedAt: TAP, recordedAt: TAP });
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "boarded", actedAt: TAP });

    const confirmation = [...s.port.presented.values()][0]!;
    expect(confirmation).toMatchObject({ title: t("toast.board.title"), categoryId: "boardConfirm" });
    expect(confirmation.body).toBe(t("toast.board.body", { line: departure.lineCode, stop_name: departure.stopName, time: "07:10" }));
    expect(readConfirm(confirmation.data)).toMatchObject({ observationId: rows[0]!.id, eventId: s.eventId });
    expect(s.port.calls.at(-1)).not.toBe("board");
  });

  it("a gravação falha: não marca o evento, não posta confirmação, só registra o erro", async () => {
    const s = await setup();
    s.failBoard();
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));
    expect(await observations(s)).toHaveLength(0);
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "scheduled", actedAt: null });
    expect(s.port.presented.size).toBe(0);
    expect(s.port.calls).not.toContain("reschedule");
    expect(s.logs).toContain("o embarque não foi gravado");
  });

  it("a mesma resposta duas vezes (ouvinte e getLastResponse), até numa partida nova, grava um registro só", async () => {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));
    await s.handler.handle(s.respond("board"));
    await s.makeHandler().handle(s.respond("board"));
    expect(await observations(s)).toHaveLength(1);
    expect(s.counts.board).toBe(1);
  });

  it("um aviso de teste (sem linha em alarm_event) também grava o fato", async () => {
    const s = await setup();
    s.setNow(TAP);
    const test = await s.scheduler.scheduleTestAlarm();
    expect(test.ok).toBe(true);
    const request = s.port.scheduled.get((test as { eventId: string }).eventId)!;
    await s.handler.handle({ actionId: "board", notification: { id: request.id, deliveredAt: TAP + 60_000, data: request.data } });
    expect(await observations(s)).toHaveLength(1);
  });

  it("sem o esquema do banco: não grava e registra o fato por log", async () => {
    const s = await setup();
    const logs: string[] = [];
    const handler = createResponseHandler({ port: s.port, getDb: async () => null, now: () => TAP, boardingStore: () => { throw new Error("não deveria"); }, reschedule: async () => undefined, log: (m) => void logs.push(m) });
    await handler.handle(s.respond("board"));
    expect(logs).toEqual(["o esquema do banco ainda não existe: nada foi gravado"]);
    expect(await observations(s)).toHaveLength(0);
  });

  it("a resposta é esquecida depois de tratada (a próxima partida a frio não a repete)", async () => {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));
    expect(s.port.calls).toContain("clearLastResponse");
  });
});

describe("T-56: Adiar 5 min", () => {
  it("antes do limite: novo aviso em +5 min, com o corpo normal; o evento fica adiado e o reagendamento o preserva", async () => {
    const s = await setup();
    s.setNow(TAP);
    const departure = readDeparture(s.request.data)!;
    const expected = snoozePlan(TAP, departure.beAtStopAt);
    expect(expected.afterStop).toBe(false);
    await s.handler.handle(s.respond("snooze"));
    const snoozed = s.port.scheduled.get(`${s.eventId}:snooze`)!;
    expect(snoozed.at).toBe(expected.at);
    expect(snoozed.body).toBe(s.request.body);
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "snoozed", snoozedTo: expected.at, actedAt: TAP });
    // O reagendamento que o tratador pede depois não apaga o adiado.
    expect(s.port.scheduled.has(`${s.eventId}:snooze`)).toBe(true);
  });

  it("depois do limite (o novo aviso passa do 'esteja no ponto às'): o corpo traz o aviso de que chega depois", async () => {
    const s = await setup();
    const departure = readDeparture(s.request.data)!;
    const now = departure.beAtStopAt - 120_000; // 2 min antes de ter de estar no ponto
    s.setNow(now);
    const expected = snoozePlan(now, departure.beAtStopAt);
    expect(expected.afterStop).toBe(true);
    await s.handler.handle(s.respond("snooze"));
    expect(s.port.scheduled.get(`${s.eventId}:snooze`)!.body).toBe(t("notif.snoozed_body", { stop_time: departure.arriveTime }));
  });

  it("depois de adiar, o botão do aviso adiado vale de novo (Registrar embarque grava)", async () => {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("snooze"));
    const snoozed = s.port.scheduled.get(`${s.eventId}:snooze`)!;
    s.setNow(TAP + 300_000);
    await s.handler.handle({ actionId: "board", notification: { id: snoozed.id, deliveredAt: snoozed.at, data: snoozed.data } });
    expect(await observations(s)).toHaveLength(1);
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "boarded" });
  });
});

describe("Dispensar e tocar no corpo", () => {
  it("Dispensar marca o evento e não cria nada", async () => {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("dismiss"));
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "dismissed", actedAt: TAP });
    expect(await observations(s)).toHaveLength(0);
  });

  it("tocar no corpo grava o intento de abrir a TL-04 do destino e não marca estado", async () => {
    const s = await setup();
    takePendingIntent();
    await s.handler.handle(s.respond("default"));
    expect(peekPendingIntent()).toEqual({ kind: "goto", placeId: s.faculId });
    takePendingIntent();
    expect(await s.alarmsRepo.getEvent(s.eventId)).toMatchObject({ state: "scheduled", actedAt: null });
  });
});

describe("Confirmação com Desfazer e Ajustar (D-102)", () => {
  async function boarded() {
    const s = await setup();
    s.setNow(TAP);
    await s.handler.handle(s.respond("board"));
    const confirmation = [...s.port.presented.values()][0]!;
    const response = (actionId: string, deliveredAt = TAP): NotificationResponse => ({ actionId, notification: { id: confirmation.id, deliveredAt, data: confirmation.data } });
    return { s, confirmation, response };
  }

  it("Desfazer apaga o registro, tira a confirmação da central e reagenda; na segunda vez não faz nada", async () => {
    const { s, confirmation, response } = await boarded();
    await s.handler.handle(response("undo"));
    const row = (await observations(s))[0]!;
    expect(row.deletedAt).toBe(TAP);
    expect(s.port.presented.has(confirmation.id)).toBe(false);
    expect(s.counts.undo).toBe(1);
    const rides = await s.db.select().from(ride);
    expect(rides.every((r) => r.deletedAt !== null)).toBe(true);

    // Outra entrega da mesma ação (instante diferente, para não cair na memória): o registro já foi apagado.
    await s.handler.handle(response("undo", TAP + 1));
    expect(s.counts.undo).toBe(1);
  });

  it("Ajustar grava o intento de abrir o registro; não mexe no banco", async () => {
    const { s, response } = await boarded();
    takePendingIntent();
    await s.handler.handle(response("adjust"));
    const id = (await observations(s))[0]!.id;
    expect(peekPendingIntent()).toEqual({ kind: "adjust", observationId: id });
    takePendingIntent();
    expect((await observations(s))[0]!.deletedAt).toBeNull();
  });
});
