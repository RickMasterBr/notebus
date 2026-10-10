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

describe("stackE08c (E-08 Bloco 1c: network e lineDetail)", () => {
  it("settings → network empilha, duas vezes não duplica e pop volta a settings", () => {
    let s = run(
      { type: "push", sheet: { kind: "settings" } },
      { type: "push", sheet: { kind: "network" } },
    );
    expect(kinds(s)).toEqual(["home", "settings", "network"]);
    expect(activeSheet(s)).toMatchObject({ kind: "network" });
    expect(stackedSheets(s)).toHaveLength(2);

    // Duas vezes não duplica
    s = step(s, { type: "push", sheet: { kind: "network" } });
    expect(kinds(s)).toEqual(["home", "settings", "network"]);
    expect(stackedSheets(s)).toHaveLength(2);

    // Pop volta à anterior
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "settings"]);
    expect(activeSheet(s)).toMatchObject({ kind: "settings" });
  });

  it("settings → lineDetail empilha, mesma lineId não duplica e pop volta a settings", () => {
    let s = run(
      { type: "push", sheet: { kind: "settings" } },
      { type: "push", sheet: { kind: "lineDetail", lineId: "line-1" } },
    );
    expect(kinds(s)).toEqual(["home", "settings", "lineDetail"]);
    expect(activeSheet(s)).toMatchObject({ kind: "lineDetail", lineId: "line-1" });
    expect(stackedSheets(s)).toHaveLength(2);

    // Mesma lineId não duplica
    s = step(s, { type: "push", sheet: { kind: "lineDetail", lineId: "line-1" } });
    expect(kinds(s)).toEqual(["home", "settings", "lineDetail"]);
    expect(stackedSheets(s)).toHaveLength(2);

    // Pop volta à anterior
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "settings"]);
    expect(activeSheet(s)).toMatchObject({ kind: "settings" });
  });

  it("lineDetail com lineId diferente empilha outra e pop volta à anterior", () => {
    let s = run(
      { type: "push", sheet: { kind: "settings" } },
      { type: "push", sheet: { kind: "lineDetail", lineId: "line-1" } },
      { type: "push", sheet: { kind: "lineDetail", lineId: "line-2" } },
    );
    expect(kinds(s)).toEqual(["home", "settings", "lineDetail", "lineDetail"]);
    expect(activeSheet(s)).toMatchObject({ kind: "lineDetail", lineId: "line-2" });
    expect(stackedSheets(s)).toHaveLength(3);

    // Pop volta à lineDetail anterior (line-1)
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "settings", "lineDetail"]);
    expect(activeSheet(s)).toMatchObject({ kind: "lineDetail", lineId: "line-1" });
    expect(stackedSheets(s)).toHaveLength(2);
  });
});
