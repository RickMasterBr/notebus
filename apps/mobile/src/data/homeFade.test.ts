import { describe, expect, it } from "vitest";
import { homeFadeHeight, homeFadeOpacity, homeFadeProgress } from "./homeFade";

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

describe("homeFadeProgress e homeFadeHeight (FN-15)", () => {
  const small = 700;
  const medium = 400;

  it("o progresso é o mesmo da opacidade", () => {
    for (const top of [750, 700, 650, 550, 450, 400, 100]) {
      expect(homeFadeProgress(top, small, medium)).toBe(homeFadeOpacity(top, small, medium));
    }
  });

  it("detent pequeno: altura zero, antes do desmonte", () => {
    expect(homeFadeHeight(homeFadeProgress(small, small, medium), 60)).toBe(0);
  });

  it("detent médio ou acima: altura inteira", () => {
    expect(homeFadeHeight(homeFadeProgress(medium, small, medium), 60)).toBe(60);
    expect(homeFadeHeight(homeFadeProgress(100, small, medium), 60)).toBe(60);
  });

  it("meio do caminho: meia altura, e cresce com a subida", () => {
    expect(homeFadeHeight(homeFadeProgress(550, small, medium), 60)).toBeCloseTo(30, 5);
    expect(homeFadeHeight(homeFadeProgress(600, small, medium), 60)).toBeLessThan(
      homeFadeHeight(homeFadeProgress(500, small, medium), 60),
    );
  });

  it("sem altura medida: zero em qualquer progresso", () => {
    expect(homeFadeHeight(1, 0)).toBe(0);
    expect(homeFadeHeight(0.5, 0)).toBe(0);
    expect(homeFadeHeight(1, Number.NaN)).toBe(0);
  });

  it("sem distância entre os detents: altura inteira", () => {
    expect(homeFadeHeight(homeFadeProgress(500, 400, 400), 60)).toBe(60);
    expect(homeFadeHeight(homeFadeProgress(500, 300, 400), 60)).toBe(60);
  });

  it("progresso fora de 0..1 é preso", () => {
    expect(homeFadeHeight(-0.5, 60)).toBe(0);
    expect(homeFadeHeight(2, 60)).toBe(60);
  });
});
