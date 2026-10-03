import { describe, expect, it } from "vitest";
import { searchPanel } from "./searchPanel";

describe("searchPanel (D-137)", () => {
  it("termo vazio com pontos abertos antes: mostra os recentes", () => {
    expect(searchPanel("", 1)).toBe("recents");
    expect(searchPanel("", 3)).toBe("recents");
  });
  it("termo vazio sem nenhum ponto aberto: mostra a mensagem", () => {
    expect(searchPanel("", 0)).toBe("prompt");
  });
  it("só espaços conta como vazio", () => {
    expect(searchPanel("   ", 2)).toBe("recents");
    expect(searchPanel("  ", 0)).toBe("prompt");
  });
  it("termo preenchido: resultados, com ou sem recentes", () => {
    expect(searchPanel("praça", 0)).toBe("results");
    expect(searchPanel("praça", 3)).toBe("results");
  });
});
