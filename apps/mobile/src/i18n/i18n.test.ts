import { describe, expect, it } from "vitest";
import { t } from "./index";
import { ptBR } from "./pt-BR";

describe("t()", () => {
  it("troca os placeholders", () => {
    expect(t("first_run.importing", { count: 9 })).toBe("Importando 9 linhas…");
    expect(t("first_run.import_mobilis.detail", { count: 9, date: "01/09/2026" })).toBe(
      "9 linhas com os horários oficiais de 01/09/2026. Tudo editável.",
    );
  });
  it("sem parâmetro devolve o texto como está; placeholder sem valor fica visível", () => {
    expect(t("home.empty.action")).toBe("Cadastrar meu ponto");
    expect(t("first_run.importing")).toBe("Importando {{count}} linhas…");
  });
  it("toda chave tem texto", () => {
    for (const [key, text] of Object.entries(ptBR)) expect(text.length, key).toBeGreaterThan(0);
  });
});
