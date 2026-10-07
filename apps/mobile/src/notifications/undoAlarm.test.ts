import { describe, expect, it } from "vitest";
import { alarmFromRow } from "../data/alarmsUi";
import type { AlarmRow } from "../db/alarms";
import { schedulerFixture, WED_0700 } from "./schedulerFixture";

describe("E-06 Item 0: Desfazer do cancelamento de aviso", () => {
  it("(a) reproduz a falha de hoje: saveAlarm com AlarmRow do aviso apagado falha com UNIQUE constraint", async () => {
    const fx = await schedulerFixture();
    const created = await fx.alarmsRepo.createAlarm(fx.newAlarm(), WED_0700);

    // Cancelar (exclusão lógica)
    await fx.alarmsRepo.deleteAlarm(created.id, WED_0700 + 1000);

    // Desfazer como fazia antes: passa a linha inteira com o id que ainda existe na tabela
    let caught: any;
    try {
      await fx.alarmsRepo.saveAlarm(created, WED_0700 + 2000);
    } catch (e: any) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(String(caught?.cause ?? caught?.message)).toMatch(/UNIQUE constraint failed: departure_alarm\.id/);
  });

  it("(b) alarmFromRow descarta id e campos de linha, mantém os de regra", () => {
    const row: AlarmRow = {
      id: "01a114f2-8300-7a36-9101-662a17642cc4",
      createdAt: 1791352800000,
      updatedAt: 1791352801000,
      deletedAt: 1791352802000,
      source: "user",
      optionId: "opt-1",
      anchorTripId: "trip-0810",
      anchorBaseMinute: 492,
      weekdays: [1, 3, 5],
      onceDate: null,
      validFrom: "2026-10-01",
      validTo: "2027-01-31",
      enabled: true,
    };

    const newAlarm = alarmFromRow(row);

    expect("id" in newAlarm).toBe(false);
    expect("createdAt" in newAlarm).toBe(false);
    expect("updatedAt" in newAlarm).toBe(false);
    expect("deletedAt" in newAlarm).toBe(false);
    expect("source" in newAlarm).toBe(false);

    expect(newAlarm).toEqual({
      optionId: "opt-1",
      anchorTripId: "trip-0810",
      anchorBaseMinute: 492,
      weekdays: [1, 3, 5],
      onceDate: null,
      validFrom: "2026-10-01",
      validTo: "2027-01-31",
      enabled: true,
    });
  });

  it("(c) o ciclo cancelar, desfazer, listar devolve um aviso ligado", async () => {
    const fx = await schedulerFixture();
    const created = await fx.alarmsRepo.createAlarm(fx.newAlarm({ weekdays: [1, 3, 5] }), WED_0700);

    // 1. Criado e ligado
    expect(await fx.alarmsRepo.listAlarms()).toHaveLength(1);

    // 2. Cancelar (exclusão lógica)
    await fx.alarmsRepo.deleteAlarm(created.id, WED_0700 + 1000);
    expect(await fx.alarmsRepo.listAlarms()).toHaveLength(0);

    // 3. Desfazer recriando com alarmFromRow
    const saveRes = await fx.alarmsRepo.saveAlarm(alarmFromRow(created), WED_0700 + 2000);
    expect(saveRes.alarm.id).not.toBe(created.id);
    expect(saveRes.alarm.enabled).toBe(true);

    // 4. Listar devolve exatamente um aviso ligado
    const live = await fx.alarmsRepo.listAlarms();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      optionId: created.optionId,
      anchorTripId: created.anchorTripId,
      anchorBaseMinute: created.anchorBaseMinute,
      weekdays: [1, 3, 5],
      enabled: true,
    });
  });

  it("(d) cancelar, ligar outro aviso para os mesmos dias, desfazer: o desfeito substitui o outro e replaced não vem vazio", async () => {
    const fx = await schedulerFixture();
    const a = await fx.alarmsRepo.createAlarm(fx.newAlarm({ weekdays: [1, 2, 3] }), WED_0700);

    // Cancelar A
    await fx.alarmsRepo.deleteAlarm(a.id, WED_0700 + 1000);
    expect(await fx.alarmsRepo.listAlarms()).toHaveLength(0);

    // Ligar outro aviso (B) para seg e ter
    const bSaved = await fx.alarmsRepo.saveAlarm(fx.newAlarm({ weekdays: [1, 2] }), WED_0700 + 2000);
    expect((await fx.alarmsRepo.listAlarms()).map((r) => r.id)).toEqual([bSaved.alarm.id]);

    // Desfazer cancelamento de A: A volta e substitui B nas segundas e terças (D-105)
    const undoRes = await fx.alarmsRepo.saveAlarm(alarmFromRow(a), WED_0700 + 3000);

    // replaced não vem vazio
    expect(undoRes.replaced).toEqual([{ alarmId: bSaved.alarm.id, weekdays: [1, 2] }]);

    // B perdeu todos os dias e foi desativado (enabled: false); A está ativo com seg, ter, qua
    const live = await fx.alarmsRepo.listAlarms();
    const active = live.filter((a) => a.enabled);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(undoRes.alarm.id);
    expect(active[0]!.weekdays).toEqual([1, 2, 3]);

    const bAfter = await fx.alarmsRepo.getAlarm(bSaved.alarm.id);
    expect(bAfter).toMatchObject({ enabled: false, weekdays: [] });
  });
});
