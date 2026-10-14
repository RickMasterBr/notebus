import { describe, expect, it } from "vitest";
import { greetingEyebrow, greetingPeriod, greetingText } from "./greeting";

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

  describe("greetingEyebrow (Item 1b)", () => {
    it("sem ponto final com e sem nome nas fronteiras 04:00, 05:00, 11:00, 12:00, 18:00, 19:00", () => {
      // 04:00 (night)
      expect(greetingEyebrow({ hour: 4, name: "Richard" })).toBe("Boa noite, Richard");
      expect(greetingEyebrow({ hour: 4, name: null })).toBe("Boa noite");

      // 05:00 (morning)
      expect(greetingEyebrow({ hour: 5, name: "Richard" })).toBe("Bom dia, Richard");
      expect(greetingEyebrow({ hour: 5, name: null })).toBe("Bom dia");

      // 11:00 (morning)
      expect(greetingEyebrow({ hour: 11, name: "Richard" })).toBe("Bom dia, Richard");
      expect(greetingEyebrow({ hour: 11, name: null })).toBe("Bom dia");

      // 12:00 (afternoon)
      expect(greetingEyebrow({ hour: 12, name: "Richard" })).toBe("Boa tarde, Richard");
      expect(greetingEyebrow({ hour: 12, name: null })).toBe("Boa tarde");

      // 18:00 (afternoon)
      expect(greetingEyebrow({ hour: 18, name: "Richard" })).toBe("Boa tarde, Richard");
      expect(greetingEyebrow({ hour: 18, name: null })).toBe("Boa tarde");

      // 19:00 (night)
      expect(greetingEyebrow({ hour: 19, name: "Richard" })).toBe("Boa noite, Richard");
      expect(greetingEyebrow({ hour: 19, name: null })).toBe("Boa noite");
    });

    it("nome só de espaços vira sem nome", () => {
      expect(greetingEyebrow({ hour: 14, name: "   " })).toBe("Boa tarde");
      expect(greetingEyebrow({ hour: 14, name: "" })).toBe("Boa tarde");
    });

    it("nenhuma saudação termina com ponto final", () => {
      const hours = [4, 5, 11, 12, 18, 19];
      for (const h of hours) {
        expect(greetingEyebrow({ hour: h, name: "Richard" })).not.toMatch(/\.$/);
        expect(greetingEyebrow({ hour: h, name: null })).not.toMatch(/\.$/);
      }
    });
  });
});

