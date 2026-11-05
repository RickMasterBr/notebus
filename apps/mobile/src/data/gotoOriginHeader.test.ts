import { describe, expect, it } from "vitest";
import { originSelectorLabel, startsChoosingOrigin } from "./gotoOriginHeader";
import { t } from "../i18n";

// Ideia 68 (contrato 07g): o "Ir para" de um lugar sem trajeto pede a origem e começa com o menu aberto.

describe("originSelectorLabel: texto do seletor de origem", () => {
  it("com nome devolve o texto de origin_label com o nome e ' ▾'", () => {
    expect(originSelectorLabel("Casa")).toBe(
      `${t("sheet_goto.origin_label", { origin: "Casa" })} ▾`,
    );
    expect(originSelectorLabel("Casa")).toBe("de Casa ▾");
  });

  it("com nome indefinido devolve o texto de origin_select_title e ' ▾'", () => {
    expect(originSelectorLabel(undefined)).toBe(`${t("sheet_goto.origin_select_title")} ▾`);
    expect(originSelectorLabel(undefined)).toBe("Escolher origem ▾");
  });

  it("com nome vazio devolve o texto de origin_select_title e ' ▾'", () => {
    expect(originSelectorLabel("")).toBe("Escolher origem ▾");
  });

  it("com nome só de espaços devolve o texto de origin_select_title e ' ▾'", () => {
    expect(originSelectorLabel("   ")).toBe("Escolher origem ▾");
  });
});

describe("startsChoosingOrigin: menu de origens aberto na abertura", () => {
  it("sem origem passada e sem trajeto (no_route) devolve true", () => {
    expect(startsChoosingOrigin(undefined, "no_route")).toBe(true);
    expect(startsChoosingOrigin(null, "no_route")).toBe(true);
  });

  it("com origem passada e sem trajeto (no_route) devolve false", () => {
    expect(startsChoosingOrigin("p-casa", "no_route")).toBe(false);
  });

  it("sem origem passada e trajeto resolvido devolve false", () => {
    expect(startsChoosingOrigin(undefined, "resolved")).toBe(false);
  });

  it("com origem passada e trajeto resolvido devolve false", () => {
    expect(startsChoosingOrigin("p-casa", "resolved")).toBe(false);
  });
});
