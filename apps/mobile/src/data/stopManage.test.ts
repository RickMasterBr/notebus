import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";
import { deleteRefusalText, newStopDraft } from "./stopManage";

const usage = (over: Partial<Record<"patternStops" | "observations" | "walkTimes" | "options", number>> = {}) => ({
  patternStops: 0,
  observations: 0,
  walkTimes: 0,
  options: 0,
  ...over,
});

describe("newStopDraft", () => {
  it("é tudo vazio e cada chamada devolve uma lista de apelidos nova", () => {
    expect(newStopDraft()).toEqual({ name: "", aliases: [], externalId: null, note: null });
    expect(newStopDraft().aliases).not.toBe(newStopDraft().aliases);
  });
});

describe("deleteRefusalText", () => {
  it("ponto oficial: texto de que a rede não se apaga, sem número", () => {
    expect(deleteRefusalText("official")).toEqual({ key: "stop_delete.official" });
  });

  it("ponto que sumiu", () => {
    expect(deleteRefusalText("not_found")).toEqual({ key: "stop_delete.not_found" });
  });

  it("um só uso: texto no singular, sem número", () => {
    expect(deleteRefusalText("in_use", usage({ observations: 1 }))).toEqual({ key: "stop_delete.in_use_records_one" });
    expect(deleteRefusalText("in_use", usage({ walkTimes: 1 }))).toEqual({ key: "stop_delete.in_use_walks_one" });
    expect(deleteRefusalText("in_use", usage({ options: 1 }))).toEqual({ key: "stop_delete.in_use_options_one" });
    expect(deleteRefusalText("in_use", usage({ patternStops: 1 }))).toEqual({ key: "stop_delete.in_use_lines_one" });
  });

  it("vários usos do mesmo tipo: texto no plural com o número", () => {
    expect(deleteRefusalText("in_use", usage({ observations: 3 }))).toEqual({
      key: "stop_delete.in_use_records_other",
      params: { n: 3 },
    });
    expect(deleteRefusalText("in_use", usage({ patternStops: 2 }))).toEqual({
      key: "stop_delete.in_use_lines_other",
      params: { n: 2 },
    });
  });

  it("vários tipos de uso: o primeiro não zero na ordem registros, tempos a pé, trajetos, linhas", () => {
    expect(deleteRefusalText("in_use", usage({ patternStops: 4, options: 3, walkTimes: 2, observations: 5 })).key).toBe(
      "stop_delete.in_use_records_other",
    );
    expect(deleteRefusalText("in_use", usage({ patternStops: 4, options: 3, walkTimes: 2 })).key).toBe(
      "stop_delete.in_use_walks_other",
    );
    expect(deleteRefusalText("in_use", usage({ patternStops: 4, options: 3 })).key).toBe("stop_delete.in_use_options_other");
    expect(deleteRefusalText("in_use", usage({ patternStops: 4 })).key).toBe("stop_delete.in_use_lines_other");
  });

  it("in_use sem uso nenhum, ou sem uso informado: texto genérico", () => {
    expect(deleteRefusalText("in_use", usage())).toEqual({ key: "stop_delete.error" });
    expect(deleteRefusalText("in_use")).toEqual({ key: "stop_delete.error" });
  });

  it("toda chave devolvida existe no catálogo, e o plural leva {{n}}", () => {
    for (const u of [{ observations: 2 }, { walkTimes: 2 }, { options: 2 }, { patternStops: 2 }] as const) {
      const { key } = deleteRefusalText("in_use", usage(u));
      expect(ptBR[key]).toContain("{{n}}");
    }
    for (const key of ["stop_delete.official", "stop_delete.not_found", "stop_delete.error"] as const) {
      expect(ptBR[key]).toBeTruthy();
    }
  });
});
