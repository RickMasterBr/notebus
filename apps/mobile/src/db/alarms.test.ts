import { describe, expect, it } from "vitest";
import { createAlarms, type NewAlarm } from "./alarms";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const T0 = 1_790_000_000_000;
let n = 0;
const newId = () => `alarm-${String(++n).padStart(3, "0")}`;

const alarm = (over: Partial<NewAlarm> = {}): NewAlarm => ({
  optionId: "opt-1",
  anchorTripId: "trip-0810",
  anchorBaseMinute: 492,
  weekdays: [1, 3, 5],
  onceDate: null,
  validFrom: "2026-10-01",
  validTo: null,
  enabled: true,
  ...over,
});

function setup() {
  const { db, sqlite } = testDbWithSqlite();
  return { sqlite, repo: createAlarms(db, { newId }) };
}

describe("db/alarms (E-06 §3.1)", () => {
  it("cria, lista sem os apagados, liga e desliga, apaga logicamente (a linha fica)", async () => {
    const { repo, sqlite } = setup();
    const a = await repo.createAlarm(alarm(), T0);
    const b = await repo.createAlarm(alarm({ weekdays: [], onceDate: "2026-10-07" }), T0 + 1);
    expect((await repo.listAlarms()).map((r) => r.id)).toEqual([a.id, b.id]);
    expect(a).toMatchObject({ source: "user", weekdays: [1, 3, 5], enabled: true, createdAt: T0, updatedAt: T0, deletedAt: null });

    expect(await repo.setEnabled(a.id, false, T0 + 10)).toMatchObject({ enabled: false, updatedAt: T0 + 10 });
    // Sem mudança real, `updated_at` não anda.
    expect((await repo.setEnabled(a.id, false, T0 + 99)).updatedAt).toBe(T0 + 10);

    await repo.deleteAlarm(b.id, T0 + 20);
    expect((await repo.listAlarms()).map((r) => r.id)).toEqual([a.id]);
    expect(sqlite.prepare("select count(*) as c, sum(deleted_at is not null) as d from departure_alarm").get()).toEqual({ c: 2, d: 1 });
  });

  it("T-61: salvar B (seg e ter) numa transação substitui A na segunda; o undo restaura A e tira B", async () => {
    const { repo } = setup();
    const a = await repo.createAlarm(alarm({ weekdays: [1, 3, 5] }), T0);
    const saved = await repo.saveAlarm(alarm({ weekdays: [1, 2] }), T0 + 100);

    expect(saved.replaced).toEqual([{ alarmId: a.id, weekdays: [1] }]);
    const now = await repo.listAlarms();
    expect(now.map((r) => [r.id, r.weekdays, r.enabled])).toEqual([[a.id, [3, 5], true], [saved.alarm.id, [1, 2], true]]);
    expect(now.find((r) => r.id === a.id)!.updatedAt).toBe(T0 + 100);

    await saved.undo(T0 + 200);
    const after = await repo.listAlarms();
    expect(after.map((r) => [r.id, r.weekdays, r.enabled])).toEqual([[a.id, [1, 3, 5], true]]);
  });

  it("aviso que perde todos os dias é desativado e não apagado; o undo o devolve", async () => {
    const { repo } = setup();
    const a = await repo.createAlarm(alarm({ weekdays: [1] }), T0);
    const saved = await repo.saveAlarm(alarm({ weekdays: [1, 2] }), T0 + 100);
    expect(await repo.getAlarm(a.id)).toMatchObject({ enabled: false, weekdays: [] });
    await saved.undo(T0 + 200);
    expect(await repo.getAlarm(a.id)).toMatchObject({ enabled: true, weekdays: [1] });
  });

  it("outra opção não é tocada, e editar com o mesmo id não cria outro aviso", async () => {
    const { repo } = setup();
    const a = await repo.createAlarm(alarm({ optionId: "opt-2", weekdays: [1] }), T0);
    const b = await repo.saveAlarm(alarm({ weekdays: [1, 3] }), T0 + 1);
    expect(b.replaced).toEqual([]);
    expect(await repo.getAlarm(a.id)).toMatchObject({ weekdays: [1], updatedAt: T0 });

    const edited = await repo.saveAlarm({ ...alarm({ weekdays: [1, 3, 5] }), id: b.alarm.id }, T0 + 2);
    expect(edited.alarm).toMatchObject({ id: b.alarm.id, weekdays: [1, 3, 5] });
    expect(await repo.listAlarms()).toHaveLength(2);
    await edited.undo(T0 + 3);
    expect(await repo.getAlarm(b.alarm.id)).toMatchObject({ weekdays: [1, 3] });
  });

  it("falha no meio da transação não grava nada (rollback)", async () => {
    const { repo, sqlite } = setup();
    await repo.createAlarm(alarm({ weekdays: [1] }), T0);
    sqlite.exec("drop table departure_alarm");
    await expect(repo.saveAlarm(alarm({ weekdays: [1] }), T0 + 1)).rejects.toThrow();
  });

  it("eventos: grava, atualiza (updated_at só se mudou) e lista por aviso, na ordem da hora planejada", async () => {
    const { repo } = setup();
    const e2 = await repo.recordEvent({ alarmId: "a1", plannedAt: T0 + 2000, serviceDate: "2026-10-09", tripId: "t", state: "scheduled" }, T0);
    const e1 = await repo.recordEvent({ alarmId: "a1", plannedAt: T0 + 1000, serviceDate: "2026-10-07", tripId: null, state: "skipped", skipReason: "holiday" }, T0 + 1);
    await repo.recordEvent({ alarmId: "a2", plannedAt: T0, serviceDate: "2026-10-07", tripId: "t", state: "scheduled" }, T0 + 2);

    expect((await repo.listEvents("a1")).map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(await repo.listEvents()).toHaveLength(3);
    expect(e1).toMatchObject({ skipReason: "holiday", actedAt: null, snoozedTo: null });

    expect(await repo.updateEvent(e2.id, { state: "boarded", actedAt: T0 + 2500 }, T0 + 3000)).toMatchObject({ state: "boarded", actedAt: T0 + 2500, updatedAt: T0 + 3000 });
    expect((await repo.updateEvent(e2.id, { state: "boarded" }, T0 + 9999)).updatedAt).toBe(T0 + 3000);
  });
});
