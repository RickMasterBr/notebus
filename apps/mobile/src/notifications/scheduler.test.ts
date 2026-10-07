import { alarmTextParams, buildWindow, planDepartures } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import { createFakePort } from "./fakePort";
import { alarmPlanInput } from "./planInput";
import { readDeparture } from "./payload";
import { createScheduler, snoozeIdOf } from "./scheduler";
import { WED_0700, lisbon, schedulerFixture } from "./schedulerFixture";

// Agendador (E-06 §3.2): porta falsa e banco de teste em memória, sobre a rede inventada de `data/registroFixture.ts`.
// Os valores esperados saem do domínio (`planDepartures`, `buildWindow`), nunca de números copiados do plano.

async function setup(alight: number[] = [5], now = WED_0700, permission: "granted" | "denied" | "undetermined" = "granted") {
  const fx = await schedulerFixture(alight);
  const port = createFakePort(permission);
  let clock = now;
  const scheduler = createScheduler({ port, db: fx.db, now: () => clock, loadSchedule: async () => fx.data });
  const expected = async (alarmRules = true) => {
    const ctx = await alarmPlanInput(fx.db, fx.data, clock);
    const rules = (await fx.alarmsRepo.listAlarms()).filter((a) => a.enabled && alarmRules);
    return planDepartures({ alarms: rules, options: ctx.options, now: clock, dayData: ctx.dayData });
  };
  return { ...fx, port, scheduler, expected, setNow: (v: number) => (clock = v) };
}

const snapshot = (port: ReturnType<typeof createFakePort>) =>
  [...port.scheduled.values()].map((r) => `${r.id}|${r.at}|${r.body}`).sort();

describe("scheduler.reschedule", () => {
  it("agenda uma notificação de data única por saída, com id determinístico e o texto do domínio", async () => {
    const s = await setup();
    const a = await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    const result = await s.scheduler.reschedule();

    const plan = await s.expected();
    expect(plan.departures.length).toBeGreaterThan(5);
    expect(result).toEqual({ ok: true, scheduled: plan.departures.length });
    expect(s.port.scheduled.size).toBe(plan.departures.length);
    for (const d of plan.departures) {
      const request = s.port.scheduled.get(`${a.id}:${d.serviceDate}`)!;
      const params = alarmTextParams(d);
      expect(request.at).toBe(d.leaveAt);
      expect(request.title).toBe(t("notif.title"));
      expect(request.body).toBe(t("notif.body", { line: params.line, time: params.time, stop_name: params.stopName, arrive_time: params.arriveTime }));
      expect(request.categoryId).toBe("departure");
      // O tratador não consulta mais nada: tudo está no `data`.
      expect(readDeparture(request.data)).toMatchObject({
        eventId: request.id,
        stopId: expect.any(String),
        lineId: expect.any(String),
        tripId: d.tripId,
        beAtStopAt: d.beAtStopAt,
        lineCode: d.lineCode,
        stopName: d.stopName,
        busTime: params.time,
        arriveTime: params.arriveTime,
        placeId: s.faculId,
        test: false,
      });
    }
  });

  it("T-52: rodar duas vezes, e duas ao mesmo tempo, dá o mesmo conjunto, sem duplicar", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();
    const first = snapshot(s.port);
    await s.scheduler.reschedule();
    expect(snapshot(s.port)).toEqual(first);
    await Promise.all([s.scheduler.reschedule(), s.scheduler.reschedule(), s.scheduler.reschedule()]);
    expect(snapshot(s.port)).toEqual(first);
    expect(new Set(first.map((l) => l.split("|")[0])).size).toBe(first.length);
  });

  it("T-51 no app: no máximo 50 da janela, a última com a linha de renovação; o adiado ainda no futuro fica de fora da conta e sobrevive", async () => {
    const s = await setup([3, 4, 5, 6, 7]);
    for (const optionId of s.optionIds) await s.alarmsRepo.createAlarm(s.newAlarm({ optionId }), WED_0700);
    const plan = await s.expected();
    const { window } = buildWindow(plan.departures);
    expect(plan.departures.length).toBeGreaterThan(50);

    // Um "Adiar" pendente: o evento diz `snoozed` e a notificação extra está agendada.
    const first = window[0]!;
    const eventId = `${first.alarmId}:${first.serviceDate}`;
    await s.scheduler.reschedule();
    await s.alarmsRepo.updateEvent(eventId, { state: "snoozed", actedAt: WED_0700, snoozedTo: WED_0700 + 300_000 }, WED_0700);
    const base = s.port.scheduled.get(eventId)!;
    await s.port.scheduleAt({ ...base, id: snoozeIdOf(eventId), at: WED_0700 + 300_000 });

    await s.scheduler.reschedule();
    const all = [...s.port.scheduled.values()];
    const windowRequests = all.filter((r) => !r.id.endsWith(":snooze"));
    expect(windowRequests).toHaveLength(50);
    expect(s.port.scheduled.has(snoozeIdOf(eventId))).toBe(true);
    // 50 da janela + 1 adiado: bem abaixo do limite de 64 do iOS.
    expect(all.length).toBe(51);
    expect(all.length).toBeLessThanOrEqual(64);
    const renew = windowRequests.filter((r) => r.body.includes(t("notif.renew")));
    expect(renew.map((r) => r.id)).toEqual([`${window[49]!.alarmId}:${window[49]!.serviceDate}`]);
    expect(Math.max(...windowRequests.map((r) => r.at))).toBe(window[49]!.leaveAt);
  });

  it("adiado que já passou não é recriado", async () => {
    const s = await setup();
    const a = await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();
    const eventId = `${a.id}:2026-10-07`;
    await s.alarmsRepo.updateEvent(eventId, { state: "snoozed", actedAt: WED_0700, snoozedTo: WED_0700 + 1000 }, WED_0700);
    await s.port.scheduleAt({ ...s.port.scheduled.get(eventId)!, id: snoozeIdOf(eventId), at: WED_0700 + 1000 });
    s.setNow(WED_0700 + 60_000);
    await s.scheduler.reschedule();
    expect(s.port.scheduled.has(snoozeIdOf(eventId))).toBe(false);
  });

  it("sem permissão: apaga os pendentes, não agenda nada e devolve permission_denied", async () => {
    const s = await setup([5], WED_0700, "denied");
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.port.scheduleAt({ id: "velho", at: WED_0700 + 1, title: "", body: "", categoryId: "departure", data: {} });
    expect(await s.scheduler.reschedule()).toEqual({ ok: false, reason: "permission_denied" });
    expect(s.port.scheduled.size).toBe(0);
    expect(await s.alarmsRepo.listEvents()).toEqual([]);
  });

  it("aviso de opção que não existe é ignorado, sem erro", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm({ optionId: "apagada-ou-de-outro-aparelho" }), WED_0700);
    expect(await s.scheduler.reschedule()).toEqual({ ok: true, scheduled: 0 });
    expect(s.port.scheduled.size).toBe(0);
  });

  it("aviso desligado não agenda", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm({ enabled: false }), WED_0700);
    expect(await s.scheduler.reschedule()).toEqual({ ok: true, scheduled: 0 });
  });

  it("um aviso que repete gera as saídas certas: só os dias escolhidos, a viagem da âncora, valores do domínio", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm({ weekdays: [1, 3], validTo: "2026-10-14" }), WED_0700);
    await s.scheduler.reschedule();
    const plan = await s.expected();
    expect(plan.departures.map((d) => d.serviceDate)).toEqual(["2026-10-07", "2026-10-12", "2026-10-14"]);
    expect([...s.port.scheduled.values()].map((r) => r.at).sort()).toEqual(plan.departures.map((d) => d.leaveAt).sort());
  });
});

describe("scheduler: linhas de alarm_event (§6)", () => {
  it("cada saída vira uma linha `scheduled` e cada dia pulado, `skipped` com o motivo; rodar de novo não duplica", async () => {
    const s = await setup([5], lisbon("2026-10-01", "07:00"));
    const a = await s.alarmsRepo.createAlarm(s.newAlarm({ weekdays: [1, 4] }), WED_0700);
    await s.scheduler.reschedule();
    await s.scheduler.reschedule();
    const events = await s.alarmsRepo.listEvents();
    const plan = await s.expected();
    expect(events.filter((e) => e.state === "scheduled").map((e) => e.id).sort()).toEqual(plan.departures.map((d) => `${a.id}:${d.serviceDate}`).sort());
    // Segunda 05/10/2026 é feriado nacional: o aviso que repete pula, com o motivo.
    expect(events.find((e) => e.id === `${a.id}:2026-10-05`)).toMatchObject({ state: "skipped", skipReason: "holiday", tripId: null });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("uma linha com ação gravada não é reescrita", async () => {
    const s = await setup();
    const a = await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();
    const id = `${a.id}:2026-10-07`;
    const acted = await s.alarmsRepo.updateEvent(id, { state: "boarded", actedAt: WED_0700 + 5 }, WED_0700 + 5);
    s.setNow(WED_0700 + 10_000);
    await s.scheduler.reschedule();
    expect(await s.alarmsRepo.getEvent(id)).toEqual(acted);
  });
});

describe("scheduler.scheduleTestAlarm (item 7)", () => {
  it("sem opção de ônibus: no_option", async () => {
    const s = await setup([]);
    expect(await s.scheduler.scheduleTestAlarm()).toEqual({ ok: false, reason: "no_option" });
    expect(s.port.scheduled.size).toBe(0);
  });

  it("agenda 1 minuto depois, com a primeira opção e data.test; o reschedule não o apaga", async () => {
    const s = await setup();
    const result = await s.scheduler.scheduleTestAlarm();
    expect(result).toEqual({ ok: true, at: WED_0700 + 60_000, eventId: `test:${WED_0700 + 60_000}` });
    const request = s.port.scheduled.get(`test:${WED_0700 + 60_000}`)!;
    expect(request).toMatchObject({ at: WED_0700 + 60_000, title: t("notif.test.title"), categoryId: "departure" });
    expect(request.body).toContain("Linha 1");
    expect(readDeparture(request.data)).toMatchObject({ test: true, stopId: expect.any(String), lineId: expect.any(String) });
    await s.scheduler.reschedule();
    expect(s.port.scheduled.has(`test:${WED_0700 + 60_000}`)).toBe(true);
  });

  it("sem permissão: permission_denied", async () => {
    const s = await setup([5], WED_0700, "denied");
    expect(await s.scheduler.scheduleTestAlarm()).toEqual({ ok: false, reason: "permission_denied" });
  });
});
