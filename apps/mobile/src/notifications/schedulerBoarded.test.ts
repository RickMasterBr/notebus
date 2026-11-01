import { planDepartures } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { observation } from "../db/schema";
import { createFakePort } from "./fakePort";
import { alarmPlanInput } from "./planInput";
import { createScheduler, eventIdOf } from "./scheduler";
import { WED_0700, lineId, schedulerFixture, stopId } from "./schedulerFixture";

// Ideia 196: com o embarque casado a uma viagem, o aviso daquela viagem naquele dia não é agendado; o resto continua.
// Os esperados saem do domínio (`planDepartures`), nunca de números copiados.

async function setup() {
  const fx = await schedulerFixture();
  const port = createFakePort("granted");
  const scheduler = createScheduler({ port, db: fx.db, now: () => WED_0700, loadSchedule: async () => fx.data });
  const alarm = await fx.alarmsRepo.createAlarm(fx.newAlarm(), WED_0700);
  const ctx = await alarmPlanInput(fx.db, fx.data, WED_0700);
  const plan = planDepartures({ alarms: [alarm], options: ctx.options, now: WED_0700, dayData: ctx.dayData });
  /** Embarque (fato) já com a viagem deduzida. */
  const board = (tripId: string | null, serviceDate: string | null, over: { kind?: "boarded" | "passed"; deletedAt?: number | null } = {}) =>
    fx.db.insert(observation).values({
      id: `obs-${Math.random()}`,
      createdAt: WED_0700,
      updatedAt: WED_0700,
      deletedAt: over.deletedAt ?? null,
      source: "user",
      stopId: stopId("A"),
      lineId: lineId("1"),
      observedAt: WED_0700,
      kind: over.kind ?? "boarded",
      mode: "live",
      recordedAt: WED_0700,
      tripId,
      serviceDate,
      matchStatus: "auto",
    });
  const scheduledIds = () => [...port.scheduled.keys()].sort();
  return { ...fx, port, scheduler, alarm, plan, board, scheduledIds };
}

describe("scheduler.reschedule com embarque casado", () => {
  it("C1: não agenda a partida da viagem (tripId, dia) já embarcada", async () => {
    const s = await setup();
    const hit = s.plan.departures[0]!;
    await s.board(hit.tripId, hit.serviceDate);
    await s.scheduler.reschedule();
    expect(s.port.scheduled.has(eventIdOf(s.alarm.id, hit.serviceDate))).toBe(false);
  });

  it("C3: as partidas de outros dias continuam agendadas, e embarque sem viagem, apagado ou 'passed' não filtra nada", async () => {
    const s = await setup();
    const hit = s.plan.departures[0]!;
    await s.board(hit.tripId, hit.serviceDate);
    await s.board(null, hit.serviceDate);
    await s.board(hit.tripId, hit.serviceDate, { kind: "passed" });
    await s.scheduler.reschedule();
    const expected = s.plan.departures.filter((d) => d.serviceDate !== hit.serviceDate).map((d) => eventIdOf(s.alarm.id, d.serviceDate)).sort();
    expect(s.plan.departures.length).toBeGreaterThan(1);
    expect(s.scheduledIds()).toEqual(expected);
  });

  it("C3: a mesma viagem em outro dia não é filtrada; embarque apagado não filtra", async () => {
    const s = await setup();
    const hit = s.plan.departures[0]!;
    await s.board(hit.tripId, "2000-01-01");
    await s.board(hit.tripId, hit.serviceDate, { deletedAt: WED_0700 });
    await s.scheduler.reschedule();
    expect(s.scheduledIds()).toEqual(s.plan.departures.map((d) => eventIdOf(s.alarm.id, d.serviceDate)).sort());
  });
});
