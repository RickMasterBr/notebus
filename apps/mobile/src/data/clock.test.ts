import { describe, expect, it } from "vitest";
import { realNow, wallClockNow } from "./clock";

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
