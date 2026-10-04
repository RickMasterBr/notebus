import { describe, expect, it } from "vitest";
import { normalizeSearch, searchStops } from "./search";

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
