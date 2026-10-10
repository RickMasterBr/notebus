// E-08 item 6 (§3.4, D-031, A5, T-86): o interruptor "Permitir avisos de saída" manda no agendador da E-06.
// Porta falsa e banco de teste em memória, sobre a rede inventada de `data/registroFixture.ts`.
import { describe, expect, it } from "vitest";
import { createPreferences } from "../data/preferences";
import { loadSchedule } from "../data/schedule";
import { readPreferences } from "../db/preferences";
import { createFakePort } from "./fakePort";
import type { PermissionState } from "./port";
import { createScheduler } from "./scheduler";
import { WED_0700, schedulerFixture } from "./schedulerFixture";

async function setup(permission: PermissionState = "granted") {
  const fx = await schedulerFixture();
  const port = createFakePort(permission);
  const scheduler = createScheduler({ port, db: fx.db, now: () => WED_0700 });
  const prefs = createPreferences({
    db: fx.db,
    exclusive: fx.registro.exclusive,
    reload: async () => void (await loadSchedule(fx.db)),
    reschedule: () => scheduler.reschedule(),
    port,
  });
  const alarmRows = () => fx.raw.all("SELECT * FROM departure_alarm ORDER BY id", []) as Record<string, unknown>[];
  const snapshot = () => [...port.scheduled.values()].map((r) => `${r.id}|${r.at}|${r.body}`).sort();
  return { ...fx, port, scheduler, prefs, alarmRows, snapshot };
}

describe("desligar o interruptor", () => {
  it("cancela tudo o que estava agendado e não agenda nada; os avisos seguem guardados e ligados", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();
    expect(s.port.scheduled.size).toBeGreaterThan(5);
    const rowsBefore = s.alarmRows();
    expect(rowsBefore).toHaveLength(1);

    s.port.calls.length = 0;
    expect(await s.prefs.setAlarmsAllowed(false, WED_0700)).toEqual({ ok: true });

    expect(s.port.scheduled.size).toBe(0);
    expect(s.port.calls).toContain("cancelAllScheduled");
    expect(s.port.calls.filter((c) => c.startsWith("scheduleAt:"))).toEqual([]);
    expect(s.alarmRows()).toEqual(rowsBefore);
    expect(s.alarmRows()[0]).toMatchObject({ enabled: 1, deleted_at: null });
    expect((await readPreferences(s.db)).alarmsAllowed).toBe(false);
  });

  it("reagendar de novo (abrir o app, voltar do segundo plano) com o interruptor desligado continua sem agendar", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.prefs.setAlarmsAllowed(false, WED_0700);
    s.port.calls.length = 0;
    expect(await s.scheduler.reschedule()).toEqual({ ok: false, reason: "alarms_off" });
    expect(await s.scheduler.reschedule()).toEqual({ ok: false, reason: "alarms_off" });
    expect(s.port.scheduled.size).toBe(0);
    expect(s.port.calls.filter((c) => c.startsWith("scheduleAt:"))).toEqual([]);
  });

  it("criar um aviso novo com o interruptor desligado grava o aviso, mas não agenda", async () => {
    const s = await setup();
    await s.prefs.setAlarmsAllowed(false, WED_0700);
    const created = await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();

    expect(s.alarmRows()).toHaveLength(1);
    expect(s.alarmRows()[0]).toMatchObject({ id: created.id, enabled: 1 });
    expect(s.port.scheduled.size).toBe(0);
  });

  it("não precisa de permissão para desligar: com a permissão negada, desligar funciona", async () => {
    const s = await setup("denied");
    expect(await s.prefs.setAlarmsAllowed(false, WED_0700)).toEqual({ ok: true });
    expect((await readPreferences(s.db)).alarmsAllowed).toBe(false);
  });
});

describe("ligar o interruptor", () => {
  it("reagenda tudo: o mesmo conjunto de antes volta a ser agendado", async () => {
    const s = await setup();
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.scheduler.reschedule();
    const before = s.snapshot();
    expect(before.length).toBeGreaterThan(5);

    await s.prefs.setAlarmsAllowed(false, WED_0700);
    expect(s.snapshot()).toEqual([]);

    expect(await s.prefs.setAlarmsAllowed(true, WED_0700)).toEqual({ ok: true });
    expect(s.snapshot()).toEqual(before);
    expect((await readPreferences(s.db)).alarmsAllowed).toBe(true);
  });

  it("sem permissão do sistema (negada): devolve no_permission, continua desligado e não grava true", async () => {
    const s = await setup("denied");
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.prefs.setAlarmsAllowed(false, WED_0700);

    expect(await s.prefs.setAlarmsAllowed(true, WED_0700 + 1)).toEqual({ ok: false, reason: "no_permission" });

    expect((await readPreferences(s.db)).alarmsAllowed).toBe(false);
    expect(s.port.scheduled.size).toBe(0);
    // Negada de vez: o app não insiste com o pedido do sistema (E-06 §5).
    expect(s.port.calls).not.toContain("requestPermission");
  });

  it("permissão ainda não decidida: pede ao sistema; concedida liga e agenda, recusada deixa desligado", async () => {
    const s = await setup("undetermined");
    await s.alarmsRepo.createAlarm(s.newAlarm(), WED_0700);
    await s.prefs.setAlarmsAllowed(false, WED_0700);

    expect(await s.prefs.setAlarmsAllowed(true, WED_0700 + 1)).toEqual({ ok: true });
    expect(s.port.calls).toContain("requestPermission");
    expect(s.port.scheduled.size).toBeGreaterThan(5);

    const refused = await setup("undetermined");
    refused.port.requestPermission = async () => "denied";
    await refused.prefs.setAlarmsAllowed(false, WED_0700);
    expect(await refused.prefs.setAlarmsAllowed(true, WED_0700 + 1)).toEqual({ ok: false, reason: "no_permission" });
    expect((await readPreferences(refused.db)).alarmsAllowed).toBe(false);
  });

  it("a frase de motivo da tela (askPermission) pode recusar o pedido do sistema: nada é pedido e nada liga", async () => {
    const fx = await schedulerFixture();
    const port = createFakePort("undetermined");
    const prefs = createPreferences({
      db: fx.db,
      exclusive: fx.registro.exclusive,
      reload: async () => {},
      reschedule: async () => {},
      port,
      askPermission: async () => false,
    });
    await prefs.setAlarmsAllowed(false, WED_0700);
    expect(await prefs.setAlarmsAllowed(true, WED_0700 + 1)).toEqual({ ok: false, reason: "no_permission" });
    expect(port.calls).not.toContain("requestPermission");
  });
});
