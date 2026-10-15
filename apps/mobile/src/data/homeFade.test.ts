import { describe, expect, it } from "vitest";
import { homeFadeOpacity } from "./homeFade";

describe("homeFadeOpacity (FN-8)", () => {
  const small = 700;
  const medium = 400;

  it("detent pequeno: invisível", () => {
    expect(homeFadeOpacity(small, small, medium)).toBe(0);
  });

  it("abaixo do pequeno (puxão além): continua 0", () => {
    expect(homeFadeOpacity(small + 50, small, medium)).toBe(0);
  });

  it("detent médio ou acima: opaca", () => {
    expect(homeFadeOpacity(medium, small, medium)).toBe(1);
    expect(homeFadeOpacity(100, small, medium)).toBe(1);
  });

  it("meio do caminho: meio opaca; cresce junto com a subida", () => {
    expect(homeFadeOpacity(550, small, medium)).toBeCloseTo(0.5, 5);
    expect(homeFadeOpacity(600, small, medium)).toBeLessThan(homeFadeOpacity(500, small, medium));
  });

  it("curva suave: perto dos extremos varia devagar", () => {
    expect(homeFadeOpacity(690, small, medium)).toBeLessThan(0.01);
  });

  it("sem distância entre os detents: opaca", () => {
    expect(homeFadeOpacity(500, 400, 400)).toBe(1);
  });
});
