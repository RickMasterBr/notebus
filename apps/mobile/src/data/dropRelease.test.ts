import { describe, expect, it } from "vitest";
import { DROP_SPRING, releaseStart } from "./dropRelease";

describe("releaseStart (FN-9)", () => {
  it("soltou sem reordenar: parte de onde o dedo soltou", () => {
    expect(releaseStart(30, 2, 2, 56)).toBe(30);
  });

  it("soltou no meio do caminho depois de descer uma posição: parte acima do novo lugar", () => {
    expect(releaseStart(40, 2, 3, 56)).toBe(-16);
  });

  it("soltou subindo duas posições: parte abaixo do novo lugar", () => {
    expect(releaseStart(-100, 4, 2, 50)).toBe(0);
    expect(releaseStart(-90, 4, 2, 50)).toBe(10);
  });

  it("a mola é constante e amortecida", () => {
    expect(DROP_SPRING).toEqual({ damping: 20, stiffness: 200 });
  });
});
