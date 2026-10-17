import { describe, expect, it } from "vitest";
import { savedPlacesOnSearch } from "./savedPlacesOnSearch";

const base = { term: "", pick: false, placesReady: true, shortcutCount: 2 };

describe("savedPlacesOnSearch", () => {
  it.each([
    ["tudo certo", base, true],
    ["só espaços no termo", { ...base, term: "   " }, true],
    ["termo digitado", { ...base, term: "ca" }, false],
    ["modo pick", { ...base, pick: true }, false],
    ["lugares ainda carregando", { ...base, placesReady: false }, false],
    ["nenhum atalho", { ...base, shortcutCount: 0 }, false],
  ])("%s", (_nome, input, show) => {
    expect(savedPlacesOnSearch(input)).toEqual({ show });
  });
});
