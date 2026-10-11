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

describe("stackE08b (E-08 bloco 2: declare)", () => {
  it("stop → declare empilha; o mesmo ponto duas vezes não duplica; pop volta ao ponto", () => {
    let s = run(
      { type: "push", sheet: { kind: "stop", stopId: "stop-a", name: "A" } },
      { type: "push", sheet: { kind: "declare", stopId: "stop-a" } },
    );
    expect(kinds(s)).toEqual(["home", "stop", "declare"]);
    expect(activeSheet(s)).toMatchObject({ kind: "declare", stopId: "stop-a" });

    s = step(s, { type: "push", sheet: { kind: "declare", stopId: "stop-a" } });
    expect(kinds(s)).toEqual(["home", "stop", "declare"]);
    expect(stackedSheets(s)).toHaveLength(2);

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "stop"]);
    expect(activeSheet(s)).toMatchObject({ kind: "stop", stopId: "stop-a" });
  });

  it("sameSheet compara o stopId: outro ponto empilha outra folha", () => {
    const s = run(
      { type: "push", sheet: { kind: "declare", stopId: "stop-a" } },
      { type: "push", sheet: { kind: "declare", stopId: "stop-b" } },
    );
    expect(kinds(s)).toEqual(["home", "declare", "declare"]);
    expect(activeSheet(s)).toMatchObject({ stopId: "stop-b" });
  });

  it("declare já na pilha, mas por baixo, sobe para o topo (regra da pilha) e não duplica", () => {
    const s = run(
      { type: "push", sheet: { kind: "declare", stopId: "stop-a" } },
      { type: "push", sheet: { kind: "declare", stopId: "stop-b" } },
      { type: "push", sheet: { kind: "declare", stopId: "stop-a" } },
    );
    expect(kinds(s)).toEqual(["home", "declare", "declare"]);
    expect(activeSheet(s)).toMatchObject({ stopId: "stop-a" });
  });

  it("declare é diferente de stop com o mesmo ponto", () => {
    const s = run(
      { type: "push", sheet: { kind: "stop", stopId: "stop-a", name: "A" } },
      { type: "push", sheet: { kind: "declare", stopId: "stop-a" } },
    );
    expect(stackedSheets(s)).toHaveLength(2);
  });
});
