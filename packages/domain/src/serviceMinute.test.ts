import { describe, expect, it } from "vitest";
import { formatServiceMinute } from "./serviceMinute";

describe("formatServiceMinute", () => {
  it("formata minutos de serviço, inclusive 24:00", () => {
    expect(formatServiceMinute(1440)).toBe("24:00");
    expect(formatServiceMinute(395)).toBe("06:35");
  });
});
