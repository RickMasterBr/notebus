import { describe, expect, it } from "vitest";
import { nativeDateToMs } from "./dates";

// T-57: o iOS entrega `notification.date` em segundos.
describe("T-57: nativeDateToMs", () => {
  it("segundos reais de 2026 (1.79e9) viram milissegundos", () => {
    expect(nativeDateToMs(1_790_000_000)).toBe(1_790_000_000_000);
    expect(new Date(nativeDateToMs(1_790_000_000)).getUTCFullYear()).toBe(2026);
  });

  it("segundos com fração (o iOS entrega Double) arredondam ao milissegundo", () => {
    expect(nativeDateToMs(1_790_000_000.1234)).toBe(1_790_000_000_123);
  });

  it("milissegundos reais de 2026 (1.79e12) ficam como estão", () => {
    expect(nativeDateToMs(1_790_000_000_000)).toBe(1_790_000_000_000);
  });

  it("o limite: logo abaixo de 1e11 é segundo, de 1e11 em diante é milissegundo", () => {
    expect(nativeDateToMs(99_999_999_999)).toBe(99_999_999_999_000);
    expect(nativeDateToMs(100_000_000_000)).toBe(100_000_000_000);
  });
});
