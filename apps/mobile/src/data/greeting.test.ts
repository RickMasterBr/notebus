import { describe, expect, it } from "vitest";
import { greetingPeriod, greetingText } from "./greeting";

describe("greeting (Item 1, D-203, D-207, ideia 50)", () => {
  describe("greetingPeriod", () => {
    it("fronteiras exatas dos períodos do dia", () => {
      // night: 0 a 4
      expect(greetingPeriod(0)).toBe("night");
      expect(greetingPeriod(4)).toBe("night");

      // morning: 5 a 11
      expect(greetingPeriod(5)).toBe("morning");
      expect(greetingPeriod(11)).toBe("morning");

      // afternoon: 12 a 18
      expect(greetingPeriod(12)).toBe("afternoon");
      expect(greetingPeriod(18)).toBe("afternoon");

      // night: 19 a 23
      expect(greetingPeriod(19)).toBe("night");
      expect(greetingPeriod(23)).toBe("night");
    });
  });

  describe("greetingText", () => {
    it("com nome: saudação e nome", () => {
      expect(greetingText({ hour: 14, name: "Richard" })).toBe("Boa tarde, Richard.");
      expect(greetingText({ hour: 8, name: "Ana" })).toBe("Bom dia, Ana.");
      expect(greetingText({ hour: 21, name: "Carlos" })).toBe("Boa noite, Carlos.");
    });

    it("sem nome: saudação direta", () => {
      expect(greetingText({ hour: 14, name: null })).toBe("Boa tarde.");
      expect(greetingText({ hour: 8, name: null })).toBe("Bom dia.");
      expect(greetingText({ hour: 21, name: null })).toBe("Boa noite.");
      expect(greetingText({ hour: 21, name: "" })).toBe("Boa noite.");
      expect(greetingText({ hour: 21, name: "   " })).toBe("Boa noite.");
    });
  });
});
