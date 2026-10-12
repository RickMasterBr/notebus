import { describe, expect, it } from "vitest";
import { lineDeleteRefusalText } from "./lineManage";

describe("lineManage: lineDeleteRefusalText", () => {
  it("devolve line_delete.official para linhas oficiais", () => {
    expect(lineDeleteRefusalText("official")).toEqual({ key: "line_delete.official" });
  });

  it("devolve line_delete.not_found para linhas não encontradas", () => {
    expect(lineDeleteRefusalText("not_found")).toEqual({ key: "line_delete.not_found" });
  });

  it("devolve singular para 1 registro (observations: 1)", () => {
    expect(lineDeleteRefusalText("in_use", { observations: 1, options: 0 })).toEqual({
      key: "line_delete.in_use_records_one",
    });
  });

  it("devolve plural para 2 registros (observations: 2)", () => {
    expect(lineDeleteRefusalText("in_use", { observations: 2, options: 0 })).toEqual({
      key: "line_delete.in_use_records_other",
      params: { n: 2 },
    });
  });

  it("devolve singular para 1 trajeto (options: 1, observations: 0)", () => {
    expect(lineDeleteRefusalText("in_use", { observations: 0, options: 1 })).toEqual({
      key: "line_delete.in_use_options_one",
    });
  });

  it("devolve plural para 3 trajetos (options: 3, observations: 0)", () => {
    expect(lineDeleteRefusalText("in_use", { observations: 0, options: 3 })).toEqual({
      key: "line_delete.in_use_options_other",
      params: { n: 3 },
    });
  });

  it("prioriza registros quando ambos são maiores que zero", () => {
    expect(lineDeleteRefusalText("in_use", { observations: 2, options: 5 })).toEqual({
      key: "line_delete.in_use_records_other",
      params: { n: 2 },
    });
    expect(lineDeleteRefusalText("in_use", { observations: 1, options: 4 })).toEqual({
      key: "line_delete.in_use_records_one",
    });
  });

  it("devolve line_delete.error quando in_use não tem contagens positivas", () => {
    expect(lineDeleteRefusalText("in_use")).toEqual({ key: "line_delete.error" });
    expect(lineDeleteRefusalText("in_use", { observations: 0, options: 0 })).toEqual({
      key: "line_delete.error",
    });
  });
});
