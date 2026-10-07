import { describe, expect, it } from "vitest";
import { createFakePort } from "./fakePort";
import { createScheduler } from "./scheduler";
import { syncAlarmEvents } from "./syncEvents";
import { WED_0700, schedulerFixture } from "./schedulerFixture";

// T-58 (lado do app): os estados do histórico a partir da central de notificações. No iPhone é hipótese, só o aparelho decide.

async function setup() {
  const fx = await schedulerFixture();
  const port = createFakePort();
  const scheduler = createScheduler({ port, db: fx.db, now: () => WED_0700, loadSchedule: async () => fx.data });
  const alarm = await fx.alarmsRepo.createAlarm(fx.newAlarm({ validTo: "2026-10-09" }), WED_0700);
  await scheduler.reschedule();
  const ids = { wed: `${alarm.id}:2026-10-07`, thu: `${alarm.id}:2026-10-08`, fri: `${alarm.id}:2026-10-09` };
  const planned = (id: string) => port.scheduled.get(id)!.at;
  return { ...fx, port, ids, planned };
}

const state = async (s: Awaited<ReturnType<typeof setup>>, id: string) => (await s.alarmsRepo.getEvent(id))!.state;

describe("syncAlarmEvents", () => {
  it("vencido e ainda na central: entregue; vencido e fora da central, sem ação: sem confirmação", async () => {
    const s = await setup();
    const now = s.planned(s.ids.thu) + 60_000; // quarta e quinta já venceram, sexta não
    s.port.presented.set(s.ids.wed, { id: s.ids.wed, title: "", body: "", categoryId: "departure", data: {}, deliveredAt: 0 });
    await syncAlarmEvents(s.port, s.db, now);
    expect(await state(s, s.ids.wed)).toBe("delivered");
    expect(await state(s, s.ids.thu)).toBe("unconfirmed");
    expect(await state(s, s.ids.fri)).toBe("scheduled");
  });

  it("a ação gravada vence: nunca regride, mesmo fora da central", async () => {
    const s = await setup();
    const now = s.planned(s.ids.fri) + 60_000;
    await s.alarmsRepo.updateEvent(s.ids.wed, { state: "boarded", actedAt: now - 1 }, now);
    await s.alarmsRepo.updateEvent(s.ids.thu, { state: "dismissed", actedAt: now - 1 }, now);
    await syncAlarmEvents(s.port, s.db, now);
    expect(await state(s, s.ids.wed)).toBe("boarded");
    expect(await state(s, s.ids.thu)).toBe("dismissed");
    expect(await state(s, s.ids.fri)).toBe("unconfirmed");
  });

  it("o aviso entregue que depois sai da central vira sem confirmação; o dia pulado continua pulado", async () => {
    const s = await setup();
    const now = s.planned(s.ids.fri) + 60_000;
    s.port.presented.set(s.ids.wed, { id: s.ids.wed, title: "", body: "", categoryId: "departure", data: {}, deliveredAt: 0 });
    await syncAlarmEvents(s.port, s.db, now);
    expect(await state(s, s.ids.wed)).toBe("delivered");
    s.port.presented.clear();
    await syncAlarmEvents(s.port, s.db, now);
    expect(await state(s, s.ids.wed)).toBe("unconfirmed");
    await s.alarmsRepo.upsertPlannedEvents([{ id: "x:2026-10-05", alarmId: "x", plannedAt: 1, serviceDate: "2026-10-05", tripId: null, state: "skipped", skipReason: "holiday" }], now);
    await syncAlarmEvents(s.port, s.db, now);
    expect(await state(s, "x:2026-10-05")).toBe("skipped");
  });
});
