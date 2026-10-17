import { describe, expect, it } from "vitest";
import { hitSlopToMinTouch } from "./touch";

describe("hitSlopToMinTouch", () => {
  it.each([
    [36, 4],
    [31, 7],
    [28, 8],
    [23, 11],
    [44, 0],
    [50, 0],
  ])("tamanho %i devolve folga %i nos quatro lados", (size, slop) => {
    expect(hitSlopToMinTouch(size)).toEqual({ top: slop, bottom: slop, left: slop, right: slop });
  });
});
