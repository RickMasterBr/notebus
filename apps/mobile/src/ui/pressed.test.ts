import { describe, expect, it } from "vitest";
import { PRESSED_OPACITY, pressedStyle } from "./pressed";

describe("pressedStyle", () => {
  it("fixa a opacidade em 0.7", () => {
    expect(PRESSED_OPACITY).toBe(0.7);
  });

  it.each([
    [false, undefined, null],
    [false, true, null],
    [true, true, null],
    [true, false, { opacity: 0.7 }],
    [true, undefined, { opacity: 0.7 }],
  ])("pressed=%s disabled=%s", (pressed, disabled, expected) => {
    expect(pressedStyle(pressed, disabled)).toEqual(expected);
  });
});
