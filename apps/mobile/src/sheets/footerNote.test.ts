/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { footerTotalHeight } from "./footerNote";

describe("footerNote: footerTotalHeight", () => {
  it("invisível devolve base independente de noteHeight", () => {
    expect(footerTotalHeight({ base: 60, noteHeight: 30, noteVisible: false })).toBe(60);
    expect(footerTotalHeight({ base: 84, noteHeight: -10, noteVisible: false })).toBe(84);
    expect(footerTotalHeight({ base: 72, noteHeight: NaN, noteVisible: false })).toBe(72);
  });

  it("visível soma base e noteHeight quando positivo", () => {
    expect(footerTotalHeight({ base: 60, noteHeight: 24, noteVisible: true })).toBe(84);
    expect(footerTotalHeight({ base: 60, noteHeight: 0, noteVisible: true })).toBe(60);
  });

  it("visível trata noteHeight negativo ou NaN como 0", () => {
    expect(footerTotalHeight({ base: 60, noteHeight: -20, noteVisible: true })).toBe(60);
    expect(footerTotalHeight({ base: 60, noteHeight: NaN, noteVisible: true })).toBe(60);
  });
});
