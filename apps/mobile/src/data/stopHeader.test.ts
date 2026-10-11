import { describe, expect, it } from "vitest";
import { aliasesLine, stopNameFor } from "./stopHeader";

const stops = [
  { id: "s1", name: "Largo Novo", aliases: [] as string[] },
  { id: "s2", name: "Praça Inventada", aliases: ["shopping"] },
  { id: "s3", name: "Estação Teste", aliases: ["estação", "ESTG"] },
];
const ready = { status: "ready", stops } as const;

describe("stopNameFor", () => {
  it("o nome do índice vence a reserva (ponto renomeado)", () => {
    expect(stopNameFor(ready, "s1", "Largo Velho")).toBe("Largo Novo");
  });
  it("sem o ponto no índice, vale a reserva", () => {
    expect(stopNameFor(ready, "nao-existe", "Largo Velho")).toBe("Largo Velho");
  });
  it("índice ainda carregando ou com erro: vale a reserva", () => {
    expect(stopNameFor({ status: "loading" }, "s1", "Largo Velho")).toBe("Largo Velho");
    expect(stopNameFor({ status: "error" }, "s1", "Largo Velho")).toBe("Largo Velho");
  });
});

describe("aliasesLine", () => {
  it("nenhum apelido: null (a linha não aparece)", () => {
    expect(aliasesLine(ready, "s1")).toBeNull();
  });
  it("um apelido", () => {
    expect(aliasesLine(ready, "s2")).toBe("shopping");
  });
  it("vários apelidos separados por ' · '", () => {
    expect(aliasesLine(ready, "s3")).toBe("estação · ESTG");
  });
  it("ponto fora do índice ou índice não pronto: null", () => {
    expect(aliasesLine(ready, "x")).toBeNull();
    expect(aliasesLine({ status: "loading" }, "s2")).toBeNull();
  });
});
