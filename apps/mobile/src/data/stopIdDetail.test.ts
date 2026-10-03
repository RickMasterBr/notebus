import { describe, expect, it } from "vitest";
import { stopIdDetail } from "./stopIdDetail";

describe("stopIdDetail", () => {
  it("devolve o ID do ponto", () => {
    expect(stopIdDetail("1234")).toBe("1234");
  });
  it("tira espaços nas pontas", () => {
    expect(stopIdDetail(" 1234 ")).toBe("1234");
  });
  it("sem ID (nulo, indefinido ou vazio) não mostra nada", () => {
    expect(stopIdDetail(null)).toBeUndefined();
    expect(stopIdDetail(undefined)).toBeUndefined();
    expect(stopIdDetail("  ")).toBeUndefined();
  });
});
