import { describe, expect, it } from "vitest";
import { parseNetworkConfig } from "./config.ts";

const valid = () => ({
  network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
  datasetName: "exemplo",
  lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
  patterns: [{ routeId: "R1", code: "L1-s1", line: "1", label: "Ida", isCircular: false }],
  stops: [{ stopId: "s1", key: "mobilis/stop/EXT1", name: "Praça", aliases: ["Pr."], externalId: null }],
  holidays: [{ id: "id-1", key: "mobilis/holiday/2026-11-20", date: "2026-11-20", name: "Municipal inventado", scope: "municipal" }],
});

/** Aplica a alteração a uma cópia válida e devolve os problemas. */
function problemsOf(change: (c: any) => void): string[] {
  const c = valid();
  change(c);
  const r = parseNetworkConfig(JSON.parse(JSON.stringify(c)));
  return r.ok ? [] : r.problems;
}

describe("parseNetworkConfig", () => {
  it("aceita uma configuração válida e devolve o mesmo conteúdo", () => {
    const r = parseNetworkConfig(valid());
    expect(r.ok && r.config).toEqual(valid());
  });

  it("recusa o que não é objeto", () => {
    for (const v of [null, [], "x", 3]) expect(parseNetworkConfig(v).ok).toBe(false);
  });

  it("linha sem number → problema com o nome do campo", () => {
    expect(problemsOf((c) => delete c.lines[0].number)).toContain("lines[0].number: texto obrigatório");
  });

  it("percurso com linha inexistente", () => {
    expect(problemsOf((c) => (c.patterns[0].line = "9"))).toEqual(["patterns[0].line: linha 9 não existe em lines"]);
  });

  it("ponto sem key", () => {
    expect(problemsOf((c) => delete c.stops[0].key)).toEqual(["stops[0].key: texto obrigatório"]);
  });

  it("feriado sem date", () => {
    expect(problemsOf((c) => delete c.holidays[0].date)).toEqual(["holidays[0].date: texto obrigatório"]);
  });

  it("tipo errado: isCircular texto, aliases não lista, lines não lista", () => {
    expect(problemsOf((c) => (c.patterns[0].isCircular = "não"))).toEqual(["patterns[0].isCircular: verdadeiro ou falso"]);
    expect(problemsOf((c) => (c.stops[0].aliases = "Pr."))).toEqual(["stops[0].aliases: lista de textos"]);
    expect(problemsOf((c) => (c.lines = {}))).toContain("lines: deve ser uma lista");
  });

  it("lista vários problemas de uma vez", () => {
    const p = problemsOf((c) => {
      delete c.network.timezone;
      delete c.datasetName;
    });
    expect(p).toEqual(["network.timezone: texto obrigatório", "config.datasetName: texto obrigatório"]);
  });
});
