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

describe("stack.e06 (Avisos de saída: repeat, alarms, alarmIntro)", () => {
  it("settings → alarms → repeat empilha e fecha na ordem", () => {
    let s = run(
      { type: "push", sheet: { kind: "settings" } },
      { type: "push", sheet: { kind: "alarms" } },
      { type: "push", sheet: { kind: "repeat", alarmId: "alarm-1" } },
    );
    expect(kinds(s)).toEqual(["home", "settings", "alarms", "repeat"]);
    expect(activeSheet(s)).toMatchObject({ kind: "repeat", alarmId: "alarm-1" });
    expect(stackedSheets(s)).toHaveLength(3);

    // Fecha repeat
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "settings", "alarms"]);
    expect(activeSheet(s)).toMatchObject({ kind: "alarms" });

    // Fecha alarms
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "settings"]);
    expect(activeSheet(s)).toMatchObject({ kind: "settings" });

    // Fecha settings
    s = step(s, POP);
    expect(kinds(s)).toEqual(["home"]);
    expect(activeSheet(s)).toMatchObject({ kind: "home" });
    expect(stackedSheets(s)).toHaveLength(0);
  });

  it("goto → repeat e goto → alarmIntro empilham sobre o goto", () => {
    // goto → repeat
    let s = run(
      { type: "push", sheet: { kind: "goto", destinationPlaceId: "p-facul" } },
      { type: "push", sheet: { kind: "repeat", alarmId: "alarm-2" } },
    );
    expect(kinds(s)).toEqual(["home", "goto", "repeat"]);
    expect(activeSheet(s)).toMatchObject({ kind: "repeat", alarmId: "alarm-2" });

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "goto"]);
    expect(activeSheet(s)).toMatchObject({ kind: "goto", destinationPlaceId: "p-facul" });

    // goto → alarmIntro (mode: reason, denied, focus)
    s = step(s, {
      type: "push",
      sheet: { kind: "alarmIntro", mode: "reason" },
    });
    expect(kinds(s)).toEqual(["home", "goto", "alarmIntro"]);
    expect(activeSheet(s)).toMatchObject({ kind: "alarmIntro", mode: "reason" });

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "goto"]);

    s = step(s, {
      type: "push",
      sheet: { kind: "alarmIntro", mode: "focus" },
    });
    expect(kinds(s)).toEqual(["home", "goto", "alarmIntro"]);
    expect(activeSheet(s)).toMatchObject({ kind: "alarmIntro", mode: "focus" });
  });

  it("fechar uma folha por baixo de outra não muda a pilha (D-152)", () => {
    const s = run(
      { type: "push", sheet: { kind: "goto", destinationPlaceId: "p-facul" } },
      { type: "push", sheet: { kind: "repeat", alarmId: "alarm-1" } },
    );
    expect(kinds(s)).toEqual(["home", "goto", "repeat"]);

    const gotoEntry = s.stack[1]!;
    expect(gotoEntry.kind).toBe("goto");

    // Tentativa de fechar a folha goto (que está coberta por repeat)
    const afterCloseUnder = step(s, { type: "close", id: gotoEntry.id });
    // Pilha permanece exatamente a mesma
    expect(kinds(afterCloseUnder)).toEqual(["home", "goto", "repeat"]);
    expect(afterCloseUnder.stack).toEqual(s.stack);

    // Fechar a do topo (repeat) funciona
    const afterCloseTop = step(afterCloseUnder, POP);
    expect(kinds(afterCloseTop)).toEqual(["home", "goto"]);
  });
});
