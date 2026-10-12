import { describe, expect, it } from "vitest";
import { normalizeSearch, searchLines, searchStops } from "./search";

// Dados inventados.
const stops = [
  { id: "1", name: "Largo Fictício", aliases: [], externalId: "9001" },
  { id: "2", name: "Praça Inventada", aliases: ["Praça do Exemplo", "Centro"], externalId: "9002" },
  { id: "3", name: "Rua Exemplo", aliases: [], externalId: "404_17" },
  { id: "4", name: "Estação Modelo", aliases: ["Gare"], externalId: null },
  { id: "5", name: "Avenida da Estação", aliases: [], externalId: "9005" },
  { id: "6", name: "Estação Alfa", aliases: [], externalId: "9006" },
];
const ids = (term: string) => searchStops(stops, term).map((s) => s.id);

describe("normalizeSearch", () => {
  it("tira acento e caixa", () => {
    expect(normalizeSearch("  Estação Ç ")).toBe("estacao c");
  });
});

describe("searchStops", () => {
  it("ignora acento e caixa nos dois lados", () => {
    expect(ids("praca")).toEqual(["2"]);
    expect(ids("FICTÍCIO")).toEqual(["1"]);
    expect(ids("estacao")).toEqual(["6", "4", "5"]);
  });
  it("casa apelido", () => {
    expect(ids("gare")).toEqual(["4"]);
    expect(ids("centro")).toEqual(["2"]);
  });
  it("casa ID externo, inclusive com sublinhado", () => {
    expect(ids("9002")).toEqual(["2"]);
    expect(ids("404_17")).toEqual(["3"]);
  });
  it("termo vazio ou só espaços devolve nada", () => {
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
  });
  it("sem resultado devolve lista vazia", () => {
    expect(ids("zzz")).toEqual([]);
  });
  it("começa-com vem antes de contém; depois alfabética", () => {
    // "Avenida da Estação" só contém (e viria primeiro na ordem alfabética); as duas "Estação…" começam.
    expect(ids("est")).toEqual(["6", "4", "5"]);
  });
  it("apelido que começa com o termo conta como começa-com", () => {
    expect(ids("praca do")).toEqual(["2"]);
  });
  it("não altera a lista recebida", () => {
    const copy = [...stops];
    searchStops(stops, "e");
    expect(stops).toEqual(copy);
  });
});

describe("T-31 (plano E-02 §5): dois pontos com o mesmo nome ficam separados", () => {
  // Dados inventados: o mesmo nome em dois lados da rua (D-015), um deles com ID e apelido.
  const twins = [
    { id: "a", name: "Largo Gêmeo", aliases: [], externalId: "9101" },
    { id: "b", name: "Largo Gêmeo", aliases: ["Gêmeo Norte"], externalId: "9102" },
    { id: "c", name: "Rua Qta. do Exemplo (Centro Comercial)", aliases: [], externalId: "9517" },
  ];
  const found = (term: string) => searchStops(twins, term).map((s) => s.id);
  it("'gemeo' e 'GÊMEO' acham os dois, sem juntar", () => {
    // O apelido "Gêmeo Norte" começa com o termo, então o "b" vem primeiro (regra do `searchStops`).
    expect(found("gemeo")).toEqual(["b", "a"]);
    expect(found("GÊMEO")).toEqual(["b", "a"]);
    expect(found("largo gemeo")).toEqual(["a", "b"]);
  });
  it("o ID acha um só; o apelido acha o ponto certo", () => {
    expect(found("9517")).toEqual(["c"]);
    expect(found("9102")).toEqual(["b"]);
    expect(found("norte")).toEqual(["b"]);
  });
});

describe("searchLines (Q-101): busca por linha", () => {
  // Dados inventados.
  const lines = [
    { id: "l1", code: "1", name: "Linha Fictícia Norte" },
    { id: "l2", code: "2", name: "Circular Exemplo" },
    { id: "l10", code: "10", name: "Expresso Alfa" },
    { id: "l11", code: "11", name: "Estação Beta" },
    { id: "l12", code: "12", name: "Modelo 1 Sul" },
    { id: "l21", code: "21", name: "Ligação 1 Centro" },
  ];
  const codes = (term: string) => searchLines(lines, term).map((l) => l.code);

  it.each([
    ["1", ["1", "10", "11", "12", "21"]],
    ["2", ["2", "21", "12"]],
    ["est", ["11"]],
    ["ESTAÇÃO", ["11"]],
    ["circ", ["2"]],
    ["exemplo", ["2"]],
    ["sul", ["12"]],
    ["centro", ["21"]],
    ["1 s", ["12"]],
    ["", []],
    ["   ", []],
    ["zzz", []],
  ])("termo %j devolve %j", (term, expected) => {
    expect(codes(term)).toEqual(expected);
  });

  it("não altera a lista recebida", () => {
    const copy = lines.map((l) => ({ ...l }));
    searchLines(lines, "1");
    expect(lines).toEqual(copy);
  });

  it("preserva os campos extras", () => {
    const withColor = [{ id: "x", code: "7", name: "Linha Cor", color: "#112233" }];
    expect(searchLines(withColor, "7")).toEqual([{ id: "x", code: "7", name: "Linha Cor", color: "#112233" }]);
  });

  it("mesmo código: desempata pelo id", () => {
    const twins = [
      { id: "b", code: "5", name: "Gêmea B" },
      { id: "a", code: "5", name: "Gêmea A" },
    ];
    expect(searchLines(twins, "5").map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("searchLines: ordem numérica e código com letra", () => {
  it("dentro da faixa o código vai em ordem numérica: 2 antes de 11", () => {
    const same = [
      { id: "a", code: "11", name: "Rota Onze" },
      { id: "b", code: "2", name: "Rota Dois" },
    ];
    expect(searchLines(same, "rota").map((l) => l.code)).toEqual(["2", "11"]);
  });

  it("código com letra casa sem diferenciar maiúsculas", () => {
    const lettered = [{ id: "a", code: "7A", name: "Rota Sete" }];
    expect(searchLines(lettered, "7a").map((l) => l.code)).toEqual(["7A"]);
    expect(searchLines(lettered, "7A").map((l) => l.code)).toEqual(["7A"]);
  });
});
