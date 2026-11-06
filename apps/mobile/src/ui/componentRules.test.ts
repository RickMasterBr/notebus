import { describe, expect, it } from "vitest";
import {
  axAt,
  groupedRowValueBelow,
  routeStopVariant,
  stackedAt,
  topBarShowsBackText,
} from "./componentRules";

describe("componentRules (regras puras de componentes)", () => {
  describe("stackedAt (limiar STACK_FONT_SCALE = 1.25)", () => {
    it("três casos de fronteira: 1.24, 1.25 e 1.26", () => {
      expect(stackedAt(1.24)).toBe(false);
      expect(stackedAt(1.25)).toBe(true);
      expect(stackedAt(1.26)).toBe(true);
    });
  });

  describe("axAt (limiar AX_FONT_SCALE = 2.6)", () => {
    it("três casos de fronteira: 2.59, 2.6 e 2.61", () => {
      expect(axAt(2.59)).toBe(false);
      expect(axAt(2.6)).toBe(true);
      expect(axAt(2.61)).toBe(true);
    });
  });

  describe("topBarShowsBackText (inverso de axAt)", () => {
    it("três casos de fronteira: 2.59, 2.6 e 2.61", () => {
      expect(topBarShowsBackText(2.59)).toBe(true);
      expect(topBarShowsBackText(2.6)).toBe(false);
      expect(topBarShowsBackText(2.61)).toBe(false);
    });
  });

  describe("groupedRowValueBelow", () => {
    it("acessório 'value' empilha nos três casos de fronteira de STACK_FONT_SCALE", () => {
      expect(groupedRowValueBelow(1.24, "value")).toBe(false);
      expect(groupedRowValueBelow(1.25, "value")).toBe(true);
      expect(groupedRowValueBelow(1.26, "value")).toBe(true);
    });

    it("outros três acessórios ('chevron', 'switch', 'none') nunca ficam abaixo mesmo com fonte grande", () => {
      for (const scale of [1.24, 1.25, 1.26, 3.0]) {
        expect(groupedRowValueBelow(scale, "chevron")).toBe(false);
        expect(groupedRowValueBelow(scale, "switch")).toBe(false);
        expect(groupedRowValueBelow(scale, "none")).toBe(false);
      }
    });
  });

  describe("routeStopVariant", () => {
    it("quatro combinações de pickable e passed", () => {
      expect(routeStopVariant({ pickable: false, passed: false })).toBe("read");
      expect(routeStopVariant({ pickable: false, passed: true })).toBe("read");
      expect(routeStopVariant({ pickable: true, passed: false })).toBe("choose");
      expect(routeStopVariant({ pickable: true, passed: true })).toBe("passed");
    });
  });
});
