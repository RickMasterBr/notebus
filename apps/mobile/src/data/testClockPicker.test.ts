import { describe, expect, it } from "vitest";
import { createTestClock, wallClockNow } from "./clock";
import { bannerA11yText, bannerText, createTapCounter, dateNumbers, hhmm, stepWall, weekdayTimeText } from "./testClockPicker";

const w = (date: string, minute: number) => ({ date, minute });

describe("stepWall (dia ±1, hora ±1, minuto ±5)", () => {
  it("dia: muda a data e mantém o minuto", () => {
    expect(stepWall(w("2026-10-01", 480), "day", 1)).toEqual(w("2026-10-02", 480));
    expect(stepWall(w("2026-10-01", 480), "day", -1)).toEqual(w("2026-09-30", 480));
    expect(stepWall(w("2026-12-31", 0), "day", 1)).toEqual(w("2027-01-01", 0));
  });
  it("hora: ±60 min, passando da meia-noite para o dia seguinte ou anterior", () => {
    expect(stepWall(w("2026-10-01", 480), "hour", 1)).toEqual(w("2026-10-01", 540));
    expect(stepWall(w("2026-10-01", 23 * 60 + 30), "hour", 1)).toEqual(w("2026-10-02", 30));
    expect(stepWall(w("2026-10-01", 30), "hour", -1)).toEqual(w("2026-09-30", 23 * 60 + 30));
  });
  it("minuto: ±1 min; 23:59 → 00:00 do dia seguinte e 00:00 → 23:59 do dia anterior", () => {
    expect(stepWall(w("2026-10-01", 480), "minute", 1)).toEqual(w("2026-10-01", 481));
    expect(stepWall(w("2026-10-01", 23 * 60 + 59), "minute", 1)).toEqual(w("2026-10-02", 0));
    expect(stepWall(w("2026-10-02", 0), "minute", -1)).toEqual(w("2026-10-01", 23 * 60 + 59));
  });
  it("mais e menos se desfazem", () => {
    const start = w("2026-03-01", 0);
    for (const unit of ["day", "hour", "minute"] as const) expect(stepWall(stepWall(start, unit, 1), unit, -1)).toEqual(start);
  });
  it("mudança de hora de 25/10/2026: o relógio ligado mostra a hora de Lisboa que o app usa", () => {
    const clock = createTestClock(() => 0);
    // 01:30 existe duas vezes: vale a primeira; subir uma hora dá 02:30 (já no horário de inverno).
    clock.set(stepWall(w("2026-10-25", 30), "hour", 1));
    expect(wallClockNow(clock.now)).toEqual(w("2026-10-25", 90));
    clock.set(stepWall(w("2026-10-25", 90), "hour", 1));
    expect(wallClockNow(clock.now)).toEqual(w("2026-10-25", 150));
    // Dia ±1 atravessa a mudança sem pular nem repetir a data.
    expect(stepWall(w("2026-10-24", 480), "day", 1)).toEqual(w("2026-10-25", 480));
    expect(stepWall(w("2026-10-25", 480), "day", 1)).toEqual(w("2026-10-26", 480));
  });
});

describe("textos", () => {
  it("hhmm e data só com números", () => {
    expect(hhmm(480)).toBe("08:00");
    expect(hhmm(23 * 60 + 5)).toBe("23:05");
    expect(dateNumbers("2026-10-08")).toBe("08/10/2026");
  });
  it("quinta 08:00 em Europe/Lisbon", () => {
    expect(weekdayTimeText(w("2026-10-08", 480))).toBe("quinta 08:00");
    const clock = createTestClock(() => 0);
    clock.set(w("2026-10-08", 480)); // quinta 08:00 de Lisboa (WEST: 07:00 UTC)
    const ms = clock.chosen()!;
    expect(ms).toBe(Date.UTC(2026, 9, 8, 7, 0));
    expect(bannerText(ms)).toBe("Relógio de teste: quinta 08:00 · toque para desligar");
    expect(bannerA11yText(ms)).toBe("Relógio de teste ligado, quinta 08:00, toque para desligar");
  });
  it("faixa perto da meia-noite usa a data de Lisboa, não a UTC", () => {
    const ms = Date.UTC(2026, 6, 4, 23, 30); // 05/07 00:30 em Lisboa (domingo)
    expect(bannerText(ms)).toContain("domingo 00:30");
  });
});

describe("contador das 7 batidas", () => {
  it("dispara na 7ª batida seguida e zera", () => {
    const c = createTapCounter();
    const results = [0, 200, 400, 600, 800, 1000, 1200].map((t) => c.tap(t));
    expect(results).toEqual([false, false, false, false, false, false, true]);
    expect(c.tap(1400)).toBe(false); // recomeça do 1
  });
  it("uma pausa zera a contagem", () => {
    const c = createTapCounter();
    for (const t of [0, 200, 400, 600, 800, 1000]) c.tap(t);
    expect(c.tap(5000)).toBe(false); // pausa: esta é a 1ª
    expect([5200, 5400, 5600, 5800].map((t) => c.tap(t))).toEqual([false, false, false, false]);
    expect(c.tap(6000)).toBe(false); // 6ª
    expect(c.tap(6200)).toBe(true); // 7ª
  });
  it("6 batidas não bastam", () => {
    const c = createTapCounter();
    expect([0, 100, 200, 300, 400, 500].some((t) => c.tap(t))).toBe(false);
  });
});
