import { describe, expect, it } from "vitest";
import { matchedAlias } from "./matchedAlias";

const stop = { name: "Praça Inventada", aliases: ["shopping", "Centro Comercial", "estação"], externalId: "3517" };

describe("matchedAlias", () => {
  it("termo que casa só com um apelido devolve o apelido", () => {
    expect(matchedAlias(stop, "shop")).toBe("shopping");
    expect(matchedAlias(stop, "comerc")).toBe("Centro Comercial");
  });
  it("casou pelo nome: null (o nome vence o apelido)", () => {
    expect(matchedAlias({ ...stop, aliases: ["praça velha"] }, "praça")).toBeNull();
    expect(matchedAlias(stop, "inventada")).toBeNull();
  });
  it("casou pelo ID: null", () => {
    expect(matchedAlias({ ...stop, aliases: ["ponto 3517"] }, "3517")).toBeNull();
  });
  it("termo vazio ou só espaços: null", () => {
    expect(matchedAlias(stop, "")).toBeNull();
    expect(matchedAlias(stop, "   ")).toBeNull();
  });
  it("dois apelidos casam: vale o primeiro da lista", () => {
    expect(matchedAlias({ ...stop, aliases: ["estação norte", "estação sul"] }, "estacao")).toBe("estação norte");
  });
  it("acento e caixa não atrapalham", () => {
    expect(matchedAlias(stop, "ESTACAO")).toBe("estação");
    expect(matchedAlias(stop, "SHOPPING")).toBe("shopping");
  });
  it("nenhum casa: null", () => {
    expect(matchedAlias(stop, "zzz")).toBeNull();
    expect(matchedAlias({ ...stop, aliases: [] }, "shop")).toBeNull();
  });
});
