import { describe, expect, it } from "vitest";
import {
  type SheetAction,
  type SheetStackState,
  activeSheet,
  initialSheetState,
  sheetReducer,
  stackedSheets,
} from "./stack";

const POP = Symbol("pop");
type Step = SheetAction | typeof POP;
const closeId = (id: number): SheetAction => ({ type: "close", id });
const step = (s: SheetStackState, a: Step): SheetStackState =>
  sheetReducer(s, a === POP ? closeId(activeSheet(s).id) : a);
const run = (...actions: Step[]): SheetStackState => actions.reduce(step, initialSheetState);
const kinds = (s: SheetStackState) => s.stack.map((e) => e.kind);

describe("stackE08 (E-08 Bloco 1b: override, pastOverrides, holiday, networkInfo)", () => {
  const e08Kinds = ["override", "pastOverrides", "holiday", "networkInfo"] as const;

  for (const kind of e08Kinds) {
    it(`settings → ${kind} empilha, não duplica ao empilhar o mesmo, e pop volta para settings`, () => {
      // 1. Empilhar a partir de settings funciona
      let s = run(
        { type: "push", sheet: { kind: "settings" } },
        { type: "push", sheet: { kind } },
      );
      expect(kinds(s)).toEqual(["home", "settings", kind]);
      expect(activeSheet(s)).toMatchObject({ kind });
      expect(stackedSheets(s)).toHaveLength(2);

      // 2. Empilhar o mesmo de novo não duplica
      s = step(s, { type: "push", sheet: { kind } });
      expect(kinds(s)).toEqual(["home", "settings", kind]);
      expect(stackedSheets(s)).toHaveLength(2);

      // 3. Voltar (pop) devolve a folha de Ajustes
      s = step(s, POP);
      expect(kinds(s)).toEqual(["home", "settings"]);
      expect(activeSheet(s)).toMatchObject({ kind: "settings" });
      expect(stackedSheets(s)).toHaveLength(1);
    });
  }
});
