import { describe, expect, it } from "vitest";
import { isDiagEnabled } from "./diagLog";

describe("isDiagEnabled (Item 1)", () => {
  it("devolve true somente para a string exata '1'", () => {
    expect(isDiagEnabled("1")).toBe(true);
  });

  it("devolve false para undefined e string vazia", () => {
    expect(isDiagEnabled(undefined)).toBe(false);
    expect(isDiagEnabled("")).toBe(false);
  });

  it("devolve false para '0' e 'true'", () => {
    expect(isDiagEnabled("0")).toBe(false);
    expect(isDiagEnabled("true")).toBe(false);
  });

  it("devolve false para variações como '1 ', ' 1' e '01'", () => {
    expect(isDiagEnabled("1 ")).toBe(false);
    expect(isDiagEnabled(" 1")).toBe(false);
    expect(isDiagEnabled("01")).toBe(false);
  });

  it("devolve false para qualquer outro valor", () => {
    expect(isDiagEnabled("false")).toBe(false);
    expect(isDiagEnabled("2")).toBe(false);
    expect(isDiagEnabled("yes")).toBe(false);
  });
});
