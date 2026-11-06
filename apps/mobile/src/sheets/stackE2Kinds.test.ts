import { describe, expect, it } from "vitest";
import {
  type SheetAction,
  type SheetContent,
  type SheetStackState,
  activeSheet,
  initialSheetState,
  sameSheet,
  sheetReducer,
} from "./stack";

const run = (...actions: SheetAction[]): SheetStackState => actions.reduce(sheetReducer, initialSheetState);
const push = (sheet: SheetContent): SheetAction => ({ type: "push", sheet });
const kinds = (s: SheetStackState) => s.stack.map((e) => e.kind);

const NOVOS: [string, SheetContent][] = [
  ["recordTrip", { kind: "recordTrip", boardingId: "emb-1" }],
  ["pendingAll", { kind: "pendingAll" }],
  ["lineNew", { kind: "lineNew" }],
];
const OUTRA: SheetContent = { kind: "stop", stopId: "stop-a", name: "Ponto A" };

describe("stackE2Kinds (V1-E2: recordTrip, pendingAll, lineNew)", () => {
  it.each(NOVOS)("%s: push empilha; igual no topo não duplica", (kind, sheet) => {
    let s = run(push(sheet));
    expect(kinds(s)).toEqual(["home", kind]);
    const before = s;
    s = sheetReducer(s, push(sheet));
    expect(s).toBe(before);
  });

  it.each(NOVOS)("%s: igual por baixo sobe para o topo com id novo", (kind, sheet) => {
    const s = run(push(sheet), push(OUTRA));
    const oldId = s.stack[1]!.id;
    const up = sheetReducer(s, push(sheet));
    expect(kinds(up)).toEqual(["home", "stop", kind]);
    expect(activeSheet(up).id).not.toBe(oldId);
  });

  it("recordTrip: boardingId diferente empilha", () => {
    const s = run(push({ kind: "recordTrip", boardingId: "emb-1" }), push({ kind: "recordTrip", boardingId: "emb-2" }));
    expect(kinds(s)).toEqual(["home", "recordTrip", "recordTrip"]);
    expect(sameSheet({ kind: "recordTrip", boardingId: "a" }, { kind: "recordTrip", boardingId: "a" })).toBe(true);
  });

  it("lineNew: com e sem initialStop, e initialStop.id diferente, são telas distintas", () => {
    const a: SheetContent = { kind: "lineNew" };
    const b: SheetContent = { kind: "lineNew", initialStop: { id: "s1", name: "Um" } };
    const c: SheetContent = { kind: "lineNew", initialStop: { id: "s2", name: "Dois" } };
    expect(sameSheet(a, b)).toBe(false);
    expect(sameSheet(b, c)).toBe(false);
    expect(sameSheet(b, { kind: "lineNew", initialStop: { id: "s1", name: "Um" } })).toBe(true);
    expect(kinds(run(push(a), push(b), push(c)))).toEqual(["home", "lineNew", "lineNew", "lineNew"]);
  });
});
