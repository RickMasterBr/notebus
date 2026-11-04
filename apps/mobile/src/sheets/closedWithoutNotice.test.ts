import { describe, expect, it } from "vitest";
import { CONFIRM_MS, closedWithoutNotice } from "./closedWithoutNotice";

describe("closedWithoutNotice", () => {
  it("montagem com índice -1 antes de abrir: falso", () => {
    expect(closedWithoutNotice({ index: -1, hasOpened: false })).toBe(false);
  });
  it("aberta (índice 0 ou mais): falso", () => {
    expect(closedWithoutNotice({ index: 0, hasOpened: true })).toBe(false);
    expect(closedWithoutNotice({ index: 1, hasOpened: true })).toBe(false);
  });
  it("fechada sem aviso (aberta e índice -1): verdadeiro", () => {
    expect(closedWithoutNotice({ index: -1, hasOpened: true })).toBe(true);
  });
  it("remontagem zera hasOpened: índice -1 volta a ser falso", () => {
    expect(closedWithoutNotice({ index: -1, hasOpened: false })).toBe(false);
  });
  it("CONFIRM_MS cobre o REVEAL_CHECK_MS de 350", () => {
    expect(CONFIRM_MS).toBeGreaterThan(350);
  });
});
