import { describe, expect, it } from "vitest";
import { alarmsEmpty, networkEmpty, searchEmpty } from "./emptyStates";

describe("emptyStates (Item 2, D-198, ideias 2 e 51)", () => {
  describe("searchEmpty", () => {
    it("campo vazio e nenhum ponto na rede -> no_stops", () => {
      expect(searchEmpty({ term: "", pick: false, stopTotal: 0, recentCount: 0 })).toBe("no_stops");
      expect(searchEmpty({ term: "   ", pick: false, stopTotal: 0, recentCount: 0 })).toBe("no_stops");
      expect(searchEmpty({ term: "", pick: true, stopTotal: 0, recentCount: 0 })).toBe("no_stops");
    });

    it("campo vazio, rede com pontos e sem recentes fora do pick -> prompt", () => {
      expect(searchEmpty({ term: "", pick: false, stopTotal: 1, recentCount: 0 })).toBe("prompt");
      expect(searchEmpty({ term: "   ", pick: false, stopTotal: 5, recentCount: 0 })).toBe("prompt");
    });

    it("campo vazio, rede com pontos e sem recentes no modo pick -> prompt_pick", () => {
      expect(searchEmpty({ term: "", pick: true, stopTotal: 1, recentCount: 0 })).toBe("prompt_pick");
      expect(searchEmpty({ term: "   ", pick: true, stopTotal: 5, recentCount: 0 })).toBe("prompt_pick");
    });

    it("campo vazio com recentes -> null (recentes aparecem)", () => {
      expect(searchEmpty({ term: "", pick: false, stopTotal: 5, recentCount: 1 })).toBeNull();
      expect(searchEmpty({ term: "   ", pick: true, stopTotal: 5, recentCount: 2 })).toBeNull();
    });

    it("termo com resultado (showNoResults falso) -> null", () => {
      expect(
        searchEmpty({ term: "Barroca", pick: false, stopTotal: 5, recentCount: 0, showNoResults: false }),
      ).toBeNull();
    });

    it("termo sem resultado (showNoResults verdadeiro) -> no_results", () => {
      expect(
        searchEmpty({ term: "Barroca", pick: false, stopTotal: 5, recentCount: 0, showNoResults: true }),
      ).toBe("no_results");
      expect(
        searchEmpty({ term: "Barroca", pick: true, stopTotal: 5, recentCount: 0, showNoResults: true }),
      ).toBe("no_results");
    });

    it("índice não pronto ou em erro (stopTotal: null) não cai em no_stops", () => {
      // campo vazio, sem recentes -> prompt
      expect(searchEmpty({ term: "", pick: false, stopTotal: null, recentCount: 0 })).toBe("prompt");
      expect(searchEmpty({ term: "   ", pick: false, stopTotal: null, recentCount: 0 })).toBe("prompt");
      // com pick -> prompt_pick
      expect(searchEmpty({ term: "", pick: true, stopTotal: null, recentCount: 0 })).toBe("prompt_pick");
      expect(searchEmpty({ term: "   ", pick: true, stopTotal: null, recentCount: 0 })).toBe("prompt_pick");
      // termo sem resultado -> no_results (não muda)
      expect(
        searchEmpty({ term: "Barroca", pick: false, stopTotal: null, recentCount: 0, showNoResults: true }),
      ).toBe("no_results");
    });
  });

  describe("networkEmpty", () => {
    it("pontos: stopCount === 0 -> net.empty.stops; stopCount > 0 -> null", () => {
      expect(networkEmpty({ stopCount: 0, lineCount: 0 }).stops).toBe("net.empty.stops");
      expect(networkEmpty({ stopCount: 1, lineCount: 0 }).stops).toBeNull();
      expect(networkEmpty({ stopCount: 5, lineCount: 2 }).stops).toBeNull();
    });

    it("linhas: lineCount === 0 com stopCount < 2 (0 e 1) -> net.empty.lines_need_stops", () => {
      // fronteira stopCount === 0
      expect(networkEmpty({ stopCount: 0, lineCount: 0 }).lines).toBe("net.empty.lines_need_stops");
      // fronteira stopCount === 1
      expect(networkEmpty({ stopCount: 1, lineCount: 0 }).lines).toBe("net.empty.lines_need_stops");
    });

    it("linhas: lineCount === 0 com stopCount >= 2 (2 e 3) -> net.empty.lines", () => {
      // fronteira stopCount === 2
      expect(networkEmpty({ stopCount: 2, lineCount: 0 }).lines).toBe("net.empty.lines");
      expect(networkEmpty({ stopCount: 3, lineCount: 0 }).lines).toBe("net.empty.lines");
    });

    it("linhas: lineCount > 0 -> null", () => {
      expect(networkEmpty({ stopCount: 0, lineCount: 1 }).lines).toBeNull();
      expect(networkEmpty({ stopCount: 2, lineCount: 1 }).lines).toBeNull();
    });
  });

  describe("alarmsEmpty", () => {
    it("placeCount === 0 -> new_place", () => {
      expect(alarmsEmpty({ placeCount: 0 })).toBe("new_place");
    });

    it("placeCount >= 1 (fronteira 1 e 2) -> places", () => {
      expect(alarmsEmpty({ placeCount: 1 })).toBe("places");
      expect(alarmsEmpty({ placeCount: 2 })).toBe("places");
    });
  });
});
