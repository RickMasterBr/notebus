import { describe, expect, it } from "vitest";
import { AHEAD_TIME_WIDTH } from "./aheadText";

describe("aheadText.timeWidth (Item 7)", () => {
  it("AHEAD_TIME_WIDTH é de 60 px para acomodar hora com ~ e algarismos tabulares", () => {
    expect(AHEAD_TIME_WIDTH).toBe(60);
    expect(AHEAD_TIME_WIDTH).toBeGreaterThanOrEqual(60);
  });
});
