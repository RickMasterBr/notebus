import { describe, expect, it } from "vitest";
import { subline } from "./rowSubline";

describe("subline (ID e apelido numa linha só)", () => {
  it("os dois: ID, ponto médio e apelido", () => {
    expect(subline("ID 1234", "também: Escola")).toBe("ID 1234 · também: Escola");
  });
  it("um só: ele mesmo", () => {
    expect(subline("ID 1234", undefined)).toBe("ID 1234");
    expect(subline(undefined, "também: Escola")).toBe("também: Escola");
  });
  it("nenhum: null", () => {
    expect(subline(undefined, undefined)).toBeNull();
    expect(subline("", "")).toBeNull();
  });
});
