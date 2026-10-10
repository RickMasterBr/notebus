import { describe, expect, it } from "vitest";
import {
  type DiagEvent,
  formatDiagLog,
  homeLayerPointerEvents,
  pushDiagEvent,
} from "./diagLog";

describe("diagLog", () => {
  describe("pushDiagEvent", () => {
    it("o registro nunca passa de max e o mais antigo sai primeiro", () => {
      let log: DiagEvent[] = [];
      log = pushDiagEvent(log, { at: 1000, text: "evento 1" }, 3);
      log = pushDiagEvent(log, { at: 2000, text: "evento 2" }, 3);
      log = pushDiagEvent(log, { at: 3000, text: "evento 3" }, 3);
      expect(log).toHaveLength(3);
      expect(log[0]?.text).toBe("evento 1");

      // Adiciona o quarto: o mais antigo ("evento 1") sai primeiro
      log = pushDiagEvent(log, { at: 4000, text: "evento 4" }, 3);
      expect(log).toHaveLength(3);
      expect(log.map((e) => e.text)).toEqual(["evento 2", "evento 3", "evento 4"]);
    });

    it("a lista de entrada não é alterada (imutável)", () => {
      const initial: readonly DiagEvent[] = Object.freeze([
        { at: 1000, text: "ev 1" },
      ]);
      const next = pushDiagEvent(initial, { at: 2000, text: "ev 2" }, 5);
      expect(initial).toHaveLength(1);
      expect(next).toHaveLength(2);
      expect(next).not.toBe(initial);
    });

    it("trata max <= 0 devolvendo lista vazia", () => {
      const log = pushDiagEvent([], { at: 1000, text: "ev" }, 0);
      expect(log).toEqual([]);
    });
  });

  describe("formatDiagLog", () => {
    it("formata uma linha por evento com segundos desde now fixo", () => {
      const events: DiagEvent[] = [
        { at: 7000, text: "seletor aberto" },
        { at: 9000, text: "fechar stop#1" },
      ];
      // now fixo em 10_000 ms (10s)
      const lines = formatDiagLog(events, 10_000);
      expect(lines).toEqual([
        "há 3 s: seletor aberto",
        "há 1 s: fechar stop#1",
      ]);
    });

    it("não produz segundos negativos se now for anterior ao evento", () => {
      const events: DiagEvent[] = [{ at: 12000, text: "futuro" }];
      const lines = formatDiagLog(events, 10_000);
      expect(lines).toEqual(["há 0 s: futuro"]);
    });
  });

  describe("homeLayerPointerEvents", () => {
    it("homeLayerPointerEvents(0) é box-none", () => {
      expect(homeLayerPointerEvents(0)).toBe("box-none");
    });

    it("homeLayerPointerEvents(1) é none", () => {
      expect(homeLayerPointerEvents(1)).toBe("none");
    });

    it("homeLayerPointerEvents(2) é none", () => {
      expect(homeLayerPointerEvents(2)).toBe("none");
    });
  });
});
