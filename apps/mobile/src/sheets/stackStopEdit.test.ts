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

describe("stackStopEdit (E-08 bloco 3: stopEdit)", () => {
  it("abrir stopEdit empilha; abrir de novo o mesmo ponto não duplica; fechar volta ao Ponto", () => {
    let s = run(
      { type: "push", sheet: { kind: "stop", stopId: "stop-a", name: "Ponto A" } },
      { type: "push", sheet: { kind: "stopEdit", stopId: "stop-a" } },
    );
    expect(kinds(s)).toEqual(["home", "stop", "stopEdit"]);
    expect(activeSheet(s)).toMatchObject({ kind: "stopEdit", stopId: "stop-a" });

    // Abrir de novo o mesmo ponto não duplica
    s = step(s, { type: "push", sheet: { kind: "stopEdit", stopId: "stop-a" } });
    expect(kinds(s)).toEqual(["home", "stop", "stopEdit"]);
    expect(stackedSheets(s)).toHaveLength(2);

    // Fechar volta ao Ponto
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "stop"]);
    expect(activeSheet(s)).toMatchObject({ kind: "stop", stopId: "stop-a" });
  });

  it("sameSheet compara o stopId: ponto diferente empilha", () => {
    const s = run(
      { type: "push", sheet: { kind: "stop", stopId: "stop-a", name: "Ponto A" } },
      { type: "push", sheet: { kind: "stopEdit", stopId: "stop-a" } },
      { type: "push", sheet: { kind: "stopEdit", stopId: "stop-b" } },
    );
    expect(kinds(s)).toEqual(["home", "stop", "stopEdit", "stopEdit"]);
    expect(activeSheet(s)).toMatchObject({ kind: "stopEdit", stopId: "stop-b" });
  });

  it("stopEdit é diferente de stop com o mesmo ponto", () => {
    const s = run(
      { type: "push", sheet: { kind: "stop", stopId: "stop-a", name: "Ponto A" } },
      { type: "push", sheet: { kind: "stopEdit", stopId: "stop-a" } },
    );
    expect(kinds(s)).toEqual(["home", "stop", "stopEdit"]);
    expect(activeSheet(s).kind).toBe("stopEdit");
  });
});
