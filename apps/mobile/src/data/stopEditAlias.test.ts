import { describe, expect, it } from "vitest";
import { addAlias } from "./stopEdit";

// E-08 bloco 5, item 0: caracterização do relato "apelido igual ao nome com o t minúsculo foi aceito".
describe("addAlias: caixa e acento contra o nome do ponto", () => {
  const name = "Arrabalde da Ponte Teste";

  it("apelido igual ao nome com 'teste' minúsculo é recusado (same_as_name)", () => {
    expect(addAlias([], "Arrabalde da Ponte teste", name)).toEqual({ ok: false, reason: "same_as_name" });
  });

  it("apelido igual ao nome com 'Teste' maiúsculo é recusado (same_as_name)", () => {
    expect(addAlias([], "Arrabalde da Ponte Teste", name)).toEqual({ ok: false, reason: "same_as_name" });
  });

  it("tudo em maiúscula e tudo em minúscula são recusados", () => {
    expect(addAlias([], "ARRABALDE DA PONTE TESTE", name)).toEqual({ ok: false, reason: "same_as_name" });
    expect(addAlias([], "arrabalde da ponte teste", name)).toEqual({ ok: false, reason: "same_as_name" });
  });

  it("acento diferente do nome também é recusado", () => {
    expect(addAlias([], "Arrabálde da Pônte Téste", name)).toEqual({ ok: false, reason: "same_as_name" });
    expect(addAlias([], "Café", "Cafe")).toEqual({ ok: false, reason: "same_as_name" });
  });

  it("espaços sobrando no meio e nas pontas não escapam da comparação", () => {
    expect(addAlias([], "  arrabalde   da ponte  teste ", name)).toEqual({ ok: false, reason: "same_as_name" });
  });

  it("apelido repetido só na caixa/acento é recusado (duplicate)", () => {
    expect(addAlias(["Shopping Leiria"], "shopping leíria", name)).toEqual({ ok: false, reason: "duplicate" });
  });
});
