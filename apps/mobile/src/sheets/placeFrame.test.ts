import { describe, expect, it } from "vitest";
import { placeFooterHeight, placeSheetFrame } from "./placeFrame";

describe("placeSheetFrame", () => {
  it("lista + rodapé nunca passam de scrollAreaHeight quando há espaço (600, 100 dá 500)", () => {
    const frame = placeSheetFrame({ scrollAreaHeight: 600, footerHeight: 100 });
    expect(frame.listHeight).toBe(500);
    expect(frame.footerHeight).toBe(100);
    expect(frame.listHeight + frame.footerHeight).toBe(600);
  });

  it("respeita piso de 80 quando scrollAreaHeight - footerHeight < 80 (150, 100 dá 80)", () => {
    const frame = placeSheetFrame({ scrollAreaHeight: 150, footerHeight: 100 });
    expect(frame.listHeight).toBe(80);
    expect(frame.footerHeight).toBe(100);
  });

  it("footerHeight é devolvido igual ao pedido", () => {
    const frame = placeSheetFrame({ scrollAreaHeight: 400, footerHeight: 88 });
    expect(frame.footerHeight).toBe(88);
  });
});

describe("placeFooterHeight", () => {
  it("calcula minTouch + space.sm + space.md + bottomInset (44, 8, 16, 34 dá 102)", () => {
    const height = placeFooterHeight({
      minTouch: 44,
      space: { sm: 8, md: 16 },
      bottomInset: 34,
    });
    expect(height).toBe(102);
  });

  it("calcula com bottomInset 0 (44, 8, 16, 0 dá 68)", () => {
    const height = placeFooterHeight({
      minTouch: 44,
      space: { sm: 8, md: 16 },
      bottomInset: 0,
    });
    expect(height).toBe(68);
  });
});
