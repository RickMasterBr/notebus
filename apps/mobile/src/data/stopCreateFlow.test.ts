import { describe, expect, it } from "vitest";
import { type SheetAction, type SheetStackState, activeSheet, initialSheetState, sheetReducer } from "../sheets/stack";
import { afterCreateActions, showUndoAfterSave } from "./stopCreateFlow";

const step = (s: SheetStackState, a: SheetAction): SheetStackState => sheetReducer(s, a);
const runActions = (init: SheetStackState, actions: SheetAction[]): SheetStackState =>
  actions.reduce(step, init);
const kinds = (s: SheetStackState) => s.stack.map((e) => e.kind);

describe("stopCreateFlow: afterCreateActions (Item 1, T-137)", () => {
  it("pilha home -> lineDetail -> search(pick) -> stopEdit + pick termina em home -> lineDetail", () => {
    // Monta a pilha real
    let s = sheetReducer(initialSheetState, {
      type: "push",
      sheet: { kind: "lineDetail", lineId: "line_1" },
    });
    s = sheetReducer(s, {
      type: "push",
      sheet: { kind: "search", pick: true },
    });
    s = sheetReducer(s, {
      type: "push",
      sheet: { kind: "stopEdit", stopId: "__new__", initialName: "Barroca", afterSave: "pick" },
    });

    expect(kinds(s)).toEqual(["home", "lineDetail", "search", "stopEdit"]);
    const actions = afterCreateActions({
      stack: s.stack,
      newStop: { id: "stop_123", name: "Barroca" },
      mode: "pick",
    });

    // Ordem estrita: close do Novo ponto vem ANTES do da Busca
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ type: "close", id: s.stack[3]!.id });
    expect(actions[1]).toEqual({ type: "close", id: s.stack[2]!.id });

    // Reducer real: termina em home -> lineDetail
    const finalState = runActions(s, actions);
    expect(kinds(finalState)).toEqual(["home", "lineDetail"]);
    expect(activeSheet(finalState).kind).toBe("lineDetail");
  });

  it("pilha home -> search -> stopEdit + open termina em home -> stop", () => {
    let s = sheetReducer(initialSheetState, {
      type: "push",
      sheet: { kind: "search" },
    });
    s = sheetReducer(s, {
      type: "push",
      sheet: { kind: "stopEdit", stopId: "__new__", initialName: "Barroca", afterSave: "open" },
    });

    expect(kinds(s)).toEqual(["home", "search", "stopEdit"]);
    const actions = afterCreateActions({
      stack: s.stack,
      newStop: { id: "stop_123", name: "Barroca" },
      mode: "open",
    });

    expect(actions).toHaveLength(3);
    expect(actions[0]).toEqual({ type: "close", id: s.stack[2]!.id });
    expect(actions[1]).toEqual({ type: "close", id: s.stack[1]!.id });
    expect(actions[2]).toEqual({
      type: "push",
      sheet: { kind: "stop", stopId: "stop_123", name: "Barroca" },
    });

    const finalState = runActions(s, actions);
    expect(kinds(finalState)).toEqual(["home", "stop"]);
    expect(activeSheet(finalState)).toMatchObject({
      kind: "stop",
      stopId: "stop_123",
      name: "Barroca",
    });
  });

  it("sem a Busca por baixo, só o Novo ponto sai (nunca fecha outra folha)", () => {
    let s = sheetReducer(initialSheetState, {
      type: "push",
      sheet: { kind: "stopEdit", stopId: "__new__" },
    });
    expect(kinds(s)).toEqual(["home", "stopEdit"]);

    const actions = afterCreateActions({
      stack: s.stack,
      newStop: { id: "stop_123", name: "Barroca" },
      mode: "pick",
    });

    expect(actions).toEqual([{ type: "close", id: s.stack[1]!.id }]);
    const finalState = runActions(s, actions);
    expect(kinds(finalState)).toEqual(["home"]);
  });

  it("o close do Novo ponto vem antes do da Busca (se inverter, a Busca não fecha)", () => {
    let s = sheetReducer(initialSheetState, {
      type: "push",
      sheet: { kind: "search", pick: true },
    });
    s = sheetReducer(s, {
      type: "push",
      sheet: { kind: "stopEdit", stopId: "__new__" },
    });

    const actions = afterCreateActions({
      stack: s.stack,
      newStop: { id: "stop_123", name: "Barroca" },
      mode: "pick",
    });

    const stopEditId = s.stack[2]!.id;
    const searchId = s.stack[1]!.id;
    expect(actions[0]).toEqual({ type: "close", id: stopEditId });
    expect(actions[1]).toEqual({ type: "close", id: searchId });
  });
});

describe("showUndoAfterSave (Item 4, decisão 2)", () => {
  it("pick -> false (Novo ponto pela Nova linha, aviso sem Desfazer)", () => {
    expect(showUndoAfterSave("pick")).toBe(false);
  });

  it("open -> true (Novo ponto pela Busca geral)", () => {
    expect(showUndoAfterSave("open")).toBe(true);
  });

  it("undefined -> true (Novo ponto aberto por Ajustes, Linhas e pontos)", () => {
    expect(showUndoAfterSave(undefined)).toBe(true);
  });
});
