import { describe, expect, it } from "vitest";
import {
  FONT_SCALE_EPSILON,
  nextFontScaleKey,
} from "./fontScaleRemount";

describe("fontScaleRemount (Item 2 puro, FN-3)", () => {
  it("FONT_SCALE_EPSILON vale 0.001", () => {
    expect(FONT_SCALE_EPSILON).toBe(0.001);
  });

  it("aumenta: incrementa a chave atual", () => {
    expect(nextFontScaleKey(1.0, 1.2, 0)).toBe(1);
    expect(nextFontScaleKey(1.2, 1.5, 3)).toBe(4);
  });

  it("diminui: não remonta (mantém a chave atual)", () => {
    expect(nextFontScaleKey(1.5, 1.0, 2)).toBe(2);
    expect(nextFontScaleKey(1.2, 1.0, 0)).toBe(0);
  });

  it("igual: não remonta (mantém a chave atual)", () => {
    expect(nextFontScaleKey(1.0, 1.0, 0)).toBe(0);
    expect(nextFontScaleKey(1.35, 1.35, 5)).toBe(5);
  });

  it("aumenta duas vezes: incrementa sequencialmente", () => {
    const k1 = nextFontScaleKey(1.0, 1.2, 0);
    expect(k1).toBe(1);
    const k2 = nextFontScaleKey(1.2, 1.4, k1);
    expect(k2).toBe(2);
  });

  it("valores em ponto flutuante quase iguais: diferença menor que 0.001 não conta como aumento", () => {
    expect(nextFontScaleKey(1.0, 1.0005, 0)).toBe(0);
    expect(nextFontScaleKey(1.0, 1.00099, 0)).toBe(0);
    expect(nextFontScaleKey(1.0009, 1.0015, 0)).toBe(0);
    // Exatamente ou acima de 0.001 conta como aumento
    expect(nextFontScaleKey(1.0, 1.001, 0)).toBe(1);
    expect(nextFontScaleKey(1.0, 1.0015, 0)).toBe(1);
  });
});
