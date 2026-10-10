import { describe, expect, it, vi } from "vitest";
import {
  changeMargin,
  deleteHolidayWithUndo,
  deleteOverrideWithUndo,
  testAlarmToastKey,
  toggleAlarms,
} from "./settingsActions";
import type { AlarmsSwitchAction } from "./alarmsSwitchFlow";

describe("settingsActions", () => {
  describe("changeMargin", () => {
    it("grava o valor novo (não o antigo)", async () => {
      const setMargin = vi.fn().mockResolvedValue(true);
      const res = await changeMargin({ current: 2, direction: 1, setMargin });
      expect(setMargin).toHaveBeenCalledWith(3);
      expect(res).toBe(3);
    });

    it("false volta ao anterior", async () => {
      const setMargin = vi.fn().mockResolvedValue(false);
      const res = await changeMargin({ current: 2, direction: 1, setMargin });
      expect(setMargin).toHaveBeenCalledWith(3);
      expect(res).toBe(2);
    });

    it("em 0 e em 10 não chama setMargin", async () => {
      const setMargin = vi.fn().mockResolvedValue(true);
      const atMin = await changeMargin({ current: 0, direction: -1, setMargin });
      expect(setMargin).not.toHaveBeenCalled();
      expect(atMin).toBe(0);

      const atMax = await changeMargin({ current: 10, direction: 1, setMargin });
      expect(setMargin).not.toHaveBeenCalled();
      expect(atMax).toBe(10);
    });
  });

  describe("toggleAlarms", () => {
    it("cada ramo chama a porta certa e só ela", async () => {
      // 1. disable
      const setAlarmsAllowed1 = vi.fn().mockResolvedValue({ ok: true });
      const openIntro1 = vi.fn();
      await toggleAlarms({
        next: false,
        decide: () => "disable",
        setAlarmsAllowed: setAlarmsAllowed1,
        openIntro: openIntro1,
      });
      expect(setAlarmsAllowed1).toHaveBeenCalledWith(false);
      expect(openIntro1).not.toHaveBeenCalled();

      // 2. enable
      const setAlarmsAllowed2 = vi.fn().mockResolvedValue({ ok: true });
      const openIntro2 = vi.fn();
      await toggleAlarms({
        next: true,
        decide: () => "enable",
        setAlarmsAllowed: setAlarmsAllowed2,
        openIntro: openIntro2,
      });
      expect(setAlarmsAllowed2).toHaveBeenCalledWith(true);
      expect(openIntro2).not.toHaveBeenCalled();

      // 3. denied
      const setAlarmsAllowed3 = vi.fn().mockResolvedValue({ ok: true });
      const openIntro3 = vi.fn();
      await toggleAlarms({
        next: true,
        decide: () => "denied",
        setAlarmsAllowed: setAlarmsAllowed3,
        openIntro: openIntro3,
      });
      expect(setAlarmsAllowed3).not.toHaveBeenCalled();
      expect(openIntro3).toHaveBeenCalledWith({ mode: "denied" });

      // 4. ask_reason
      const setAlarmsAllowed4 = vi.fn().mockResolvedValue({ ok: true });
      const openIntro4 = vi.fn();
      await toggleAlarms({
        next: true,
        decide: () => "ask_reason",
        setAlarmsAllowed: setAlarmsAllowed4,
        openIntro: openIntro4,
      });
      expect(setAlarmsAllowed4).not.toHaveBeenCalled();
      expect(openIntro4).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "reason", onResolve: expect.any(Function) }),
      );
    });

    it("'Agora não' deixa desligado", async () => {
      const setAlarmsAllowed = vi.fn().mockResolvedValue({ ok: true });
      let resolveIntro!: (accepted: boolean) => Promise<void>;
      const openIntro = vi.fn(({ onResolve }) => {
        resolveIntro = onResolve;
      });

      await toggleAlarms({
        next: true,
        decide: () => "ask_reason",
        setAlarmsAllowed,
        openIntro,
      });

      // Usuário toca "Agora não" (accepted: false)
      await resolveIntro(false);
      expect(setAlarmsAllowed).not.toHaveBeenCalled();
    });

    it("ask_reason aceito chama setAlarmsAllowed(true) e se der no_permission abre denied", async () => {
      const setAlarmsAllowed = vi.fn().mockResolvedValue({ ok: false, reason: "no_permission" });
      let resolveIntro!: (accepted: boolean) => Promise<void>;
      const openIntro = vi.fn(({ onResolve }) => {
        resolveIntro = onResolve;
      });

      await toggleAlarms({
        next: true,
        decide: () => "ask_reason",
        setAlarmsAllowed,
        openIntro,
      });

      // Usuário aceita
      await resolveIntro(true);
      expect(setAlarmsAllowed).toHaveBeenCalledWith(true);
      expect(openIntro).toHaveBeenCalledWith({ mode: "denied" });
    });
  });

  describe("deleteOverrideWithUndo", () => {
    it("id certo vai para a porta e undo chama undo do resultado", async () => {
      const undoMock = vi.fn().mockResolvedValue(undefined);
      const deleteOverride = vi.fn().mockResolvedValue({ ok: true, undo: undoMock });
      const now = vi.fn().mockReturnValue(12345);
      const toastShow = vi.fn();
      const onSuccess = vi.fn();

      await deleteOverrideWithUndo({
        id: "ov-1",
        deleteOverride,
        now,
        toast: { show: toastShow },
        onSuccess,
      });

      expect(deleteOverride).toHaveBeenCalledWith("ov-1", 12345);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Exceção apagada",
          action: expect.objectContaining({ label: "Desfazer", run: expect.any(Function) }),
        }),
      );

      // Dispara o undo do toast
      const toastAction = toastShow.mock.calls[0]![0].action!;
      await toastAction.run();
      expect(undoMock).toHaveBeenCalledWith(12345);
      expect(onSuccess).toHaveBeenCalledTimes(2);
    });

    it("recusa não mostra toast de sucesso", async () => {
      const deleteOverride = vi.fn().mockResolvedValue({ ok: false, reason: "not_found" });
      const now = vi.fn().mockReturnValue(12345);
      const toastShow = vi.fn();

      await deleteOverrideWithUndo({
        id: "ov-nao-existe",
        deleteOverride,
        now,
        toast: { show: toastShow },
      });

      expect(deleteOverride).toHaveBeenCalledWith("ov-nao-existe", 12345);
      expect(toastShow).not.toHaveBeenCalled();
    });
  });

  describe("deleteHolidayWithUndo", () => {
    it("id certo vai para a porta e undo chama undo do resultado", async () => {
      const undoMock = vi.fn().mockResolvedValue(undefined);
      const deleteHoliday = vi.fn().mockResolvedValue({ ok: true, undo: undoMock });
      const now = vi.fn().mockReturnValue(23456);
      const toastShow = vi.fn();
      const onSuccess = vi.fn();

      await deleteHolidayWithUndo({
        id: "hol-1",
        deleteHoliday,
        now,
        toast: { show: toastShow },
        onSuccess,
      });

      expect(deleteHoliday).toHaveBeenCalledWith("hol-1", 23456);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Feriado apagado",
          action: expect.objectContaining({ label: "Desfazer", run: expect.any(Function) }),
        }),
      );

      const toastAction = toastShow.mock.calls[0]![0].action!;
      await toastAction.run();
      expect(undoMock).toHaveBeenCalledWith(23456);
      expect(onSuccess).toHaveBeenCalledTimes(2);
    });

    it("recusa não mostra toast de sucesso (e feriado official mostra toast de erro)", async () => {
      const deleteHoliday = vi.fn().mockResolvedValue({ ok: false, reason: "official" });
      const now = vi.fn().mockReturnValue(23456);
      const toastShow = vi.fn();

      await deleteHolidayWithUndo({
        id: "hol-official",
        deleteHoliday,
        now,
        toast: { show: toastShow },
      });

      expect(deleteHoliday).toHaveBeenCalledWith("hol-official", 23456);
      expect(toastShow).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "error",
        }),
      );
    });
  });

  describe("testAlarmToastKey", () => {
    it("mapeia exaustivamente cada resultado", () => {
      expect(testAlarmToastKey({ ok: true, at: 1000, eventId: "e1" })).toBe("alarms.test_scheduled");
      expect(testAlarmToastKey({ ok: false, reason: "no_option" })).toBe("alarms.test_no_option");
      expect(testAlarmToastKey({ ok: false, reason: "alarms_off" })).toBe("settings.alarms.test_off");
      expect(testAlarmToastKey({ ok: false, reason: "permission_denied" })).toBeNull();
    });
  });
});
