import { planDepartures } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { createFakePort } from "./fakePort";
import { alarmPlanInput } from "./planInput";
import { createScheduler, eventIdOf, snoozeIdOf } from "./scheduler";
import { WED_0700, schedulerFixture } from "./schedulerFixture";

// Ideia 227: o aviso de sair que já tocou não toca de novo quando o app abre (reagenda) no mesmo minuto.

async function setup() {
  const fx = await schedulerFixture();
  const port = createFakePort("granted");
  let clock = WED_0700;
  const scheduler = createScheduler({ port, db: fx.db, now: () => clock, loadSchedule: async () => fx.data });
  const alarm = await fx.alarmsRepo.createAlarm(fx.newAlarm(), WED_0700);
  const ctx = await alarmPlanInput(fx.db, fx.data, WED_0700);
  const plan = planDepartures({ alarms: [alarm], options: ctx.options, now: WED_0700, dayData: ctx.dayData });
  const first = plan.departures[0]!;
  const id = eventIdOf(alarm.id, first.serviceDate);
  const scheduleCount = () => port.calls.filter((c) => c === `scheduleAt:${id}`).length;
  return { ...fx, port, scheduler, alarm, plan, first, id, scheduleCount, setNow: (v: number) => (clock = v) };
}

describe("scheduler.reschedule não repete o aviso que já tocou", () => {
  it("C2: now 20 s depois do leaveAt, a 1ª chamada agenda uma vez e a 2ª, 15 s depois, não agenda o mesmo id", async () => {
    const s = await setup();
    s.setNow(s.first.leaveAt + 20_000);
    await s.scheduler.reschedule();
    expect(s.scheduleCount()).toBe(1);
    expect(s.port.scheduled.get(s.id)!.at).toBe(s.first.leaveAt + 21_000);
    s.setNow(s.first.leaveAt + 35_000);
    await s.scheduler.reschedule();
    expect(s.scheduleCount()).toBe(1);
    expect(s.port.scheduled.has(s.id)).toBe(false);
    // as saídas futuras seguem agendadas
    expect(s.port.scheduled.size).toBe(s.plan.departures.length - 1);
  });

  it("aviso sem evento dentro do minuto ainda agenda para now + 1 s", async () => {
    const s = await setup();
    const now = s.first.leaveAt + 20_000;
    s.setNow(now);
    await s.scheduler.reschedule();
    expect(s.port.scheduled.get(s.id)!.at).toBe(now + 1000);
  });

  it("saída futura é reagendada a cada chamada", async () => {
    const s = await setup();
    await s.scheduler.reschedule();
    await s.scheduler.reschedule();
    expect(s.scheduleCount()).toBe(2);
    expect(s.port.scheduled.has(s.id)).toBe(true);
  });

  it("adiar ainda no futuro é mantido, mesmo com a saída original já tocada", async () => {
    const s = await setup();
    s.setNow(s.first.leaveAt + 20_000);
    await s.scheduler.reschedule();
    const snoozedTo = s.first.leaveAt + 300_000;
    await s.alarmsRepo.updateEvent(s.id, { state: "snoozed", actedAt: s.first.leaveAt + 25_000, snoozedTo }, s.first.leaveAt + 25_000);
    await s.port.scheduleAt({ ...s.port.scheduled.get(s.id)!, id: snoozeIdOf(s.id), at: snoozedTo });
    s.setNow(s.first.leaveAt + 35_000);
    await s.scheduler.reschedule();
    expect(s.port.scheduled.get(snoozeIdOf(s.id))!.at).toBe(snoozedTo);
  });
});
