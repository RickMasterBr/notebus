import { describe, expect, it } from "vitest";
import { type CalendarData, serviceDaysAt } from "@notebus/domain";
import { createTestClock, realNow, wallClockNow, wallClockToInstant } from "./clock";

describe("relógio injetável", () => {
  it("um relógio falso muda o resultado", () => {
    let fake = Date.UTC(2026, 9, 1, 7, 55); // 01/10/2026 07:55 em Lisboa (WEST, UTC+1 → 08:55)
    const source = () => fake;
    expect(wallClockNow(source)).toEqual({ date: "2026-10-01", minute: 8 * 60 + 55 });
    fake = Date.UTC(2026, 9, 1, 23, 30); // 00:30 do dia seguinte em Lisboa
    expect(wallClockNow(source)).toEqual({ date: "2026-10-02", minute: 30 });
  });

  it("o relógio padrão é o real", () => {
    const before = Date.now();
    const value = realNow();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});

describe("relógio de teste (D-095)", () => {
  it("desligado devolve o relógio real (injetado)", () => {
    let real = 1_000;
    const clock = createTestClock(() => real);
    expect(clock.isOn()).toBe(false);
    expect(clock.chosen()).toBeNull();
    expect(clock.now()).toBe(1_000);
    real = 2_000;
    expect(clock.now()).toBe(2_000);
  });

  it("ligado devolve o instante escolhido, parado, em hora de parede de Lisboa", () => {
    let real = 5;
    const clock = createTestClock(() => real);
    clock.set({ date: "2026-10-08", minute: 8 * 60 }); // quinta 08:00
    const chosen = clock.now();
    real = 99_999_999;
    expect(clock.now()).toBe(chosen);
    expect(clock.isOn()).toBe(true);
    expect(wallClockNow(clock.now)).toEqual({ date: "2026-10-08", minute: 480 });
  });

  it("ligar, trocar, desligar e religar não deixa resíduo", () => {
    const clock = createTestClock(() => 42);
    clock.set({ date: "2026-10-08", minute: 480 });
    clock.set({ date: "2026-12-25", minute: 600 });
    expect(wallClockNow(clock.now)).toEqual({ date: "2026-12-25", minute: 600 });
    clock.turnOff();
    expect(clock.now()).toBe(42);
    expect(clock.chosen()).toBeNull();
    clock.setInstant(7);
    expect(clock.now()).toBe(7);
    clock.turnOff();
    expect(clock.now()).toBe(42);
  });

  it("um relógio novo nasce desligado (fechar o app o desliga: nada é gravado)", () => {
    createTestClock(() => 1).set({ date: "2026-10-08", minute: 480 });
    expect(createTestClock(() => 1).isOn()).toBe(false);
  });

  it("hora de parede ida e volta no verão, no inverno e em 25/10/2026", () => {
    for (const [date, minute] of [
      ["2026-08-12", 480],
      ["2026-12-25", 0],
      ["2027-05-22", 1439],
      ["2026-10-25", 180],
    ] as const) {
      expect(wallClockNow(() => wallClockToInstant({ date, minute }))).toEqual({ date, minute });
    }
  });

  it("25/10/2026 01:30: o relógio de teste passa o instante (primeira ocorrência) e o minuto de parede é o mesmo nas duas", () => {
    const first = wallClockToInstant({ date: "2026-10-25", minute: 90 });
    expect(wallClockNow(() => first)).toEqual({ date: "2026-10-25", minute: 90 });
    expect(wallClockNow(() => first + 3_600_000)).toEqual({ date: "2026-10-25", minute: 90 }); // D-093: 2ª vez
    expect(wallClockNow(() => first + 2 * 3_600_000)).toEqual({ date: "2026-10-25", minute: 150 });
  });

  it("hora que não existe (29/03/2026 01:30) cai na seguinte", () => {
    expect(wallClockNow(() => wallClockToInstant({ date: "2026-03-29", minute: 90 }))).toEqual({ date: "2026-03-29", minute: 150 });
  });

  it("quinta 08:00 dá dia útil e domingo/25-12 dão domingo/feriado", () => {
    const calendar: CalendarData = { holidays: [], overrides: [] };
    const at = (date: string, minute: number) => {
      const clock = createTestClock(() => 0);
      clock.set({ date, minute });
      return serviceDaysAt(clock.now(), calendar).today.dayType.dayType;
    };
    expect(at("2026-10-08", 480)).toBe("weekday");
    expect(at("2026-10-11", 480)).toBe("sunday_holiday");
    expect(at("2026-12-25", 480)).toBe("sunday_holiday");
  });
});
