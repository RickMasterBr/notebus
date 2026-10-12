import { describe, expect, it } from "vitest";
import { type SearchViewInput, searchView } from "./searchResults";

const base: SearchViewInput = {
  term: "abc",
  recentCount: 0,
  pick: false,
  stopCount: 0,
  lineCount: 0,
  linesReady: true,
};
const view = (over: Partial<SearchViewInput>) => searchView({ ...base, ...over });
const shows = (v: ReturnType<typeof searchView>) => [v.showStops, v.showLines, v.showNoResults];

describe("searchView", () => {
  it("termo vazio com recentes: painel recents, nada de resultado", () => {
    const v = view({ term: "", recentCount: 2, stopCount: 2, lineCount: 3 });
    expect(v.panel).toBe("recents");
    expect(shows(v)).toEqual([false, false, false]);
  });

  it("termo vazio sem recentes: painel prompt, nada de resultado", () => {
    const v = view({ term: "  ", recentCount: 0 });
    expect(v.panel).toBe("prompt");
    expect(shows(v)).toEqual([false, false, false]);
  });

  it("só pontos", () => {
    const v = view({ stopCount: 2 });
    expect(v.panel).toBe("results");
    expect(shows(v)).toEqual([true, false, false]);
  });

  it("só linhas", () => {
    expect(shows(view({ lineCount: 1 }))).toEqual([false, true, false]);
  });

  it("pontos e linhas", () => {
    expect(shows(view({ stopCount: 2, lineCount: 3 }))).toEqual([true, true, false]);
  });

  it("nada em nenhum, linhas prontas: Nada encontrado", () => {
    expect(shows(view({}))).toEqual([false, false, true]);
  });

  it("nada em nenhum, linhas ainda carregando: sem Nada encontrado", () => {
    expect(shows(view({ linesReady: false }))).toEqual([false, false, false]);
  });

  it("pick: linha não aparece e o Nada encontrado vale mesmo sem linhas prontas", () => {
    expect(shows(view({ pick: true, lineCount: 3, linesReady: false }))).toEqual([false, false, true]);
  });

  it("pick com pontos: só pontos", () => {
    expect(shows(view({ pick: true, stopCount: 2, lineCount: 3 }))).toEqual([true, false, false]);
  });
});
