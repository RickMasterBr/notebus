import { describe, expect, it } from "vitest";
import {
  activeSheet,
  initialSheetState,
  sheetReducer,
  stackedSheets,
} from "./stack";

describe("stackGhost: sequências de folhas ao marcar um ponto", () => {
  it("push de stop, close desse id termina vazio", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const stopId = activeSheet(state).id;
    expect(stackedSheets(state)).toHaveLength(1);

    state = sheetReducer(state, { type: "close", id: stopId });
    expect(stackedSheets(state)).toEqual([]);
  });

  it("push de outra folha logo em seguida termina vazio", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const id1 = activeSheet(state).id;
    state = sheetReducer(state, { type: "close", id: id1 });

    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "place", placeId: "p1" },
    });
    const id2 = activeSheet(state).id;
    state = sheetReducer(state, { type: "close", id: id2 });

    expect(stackedSheets(state)).toEqual([]);
  });

  it("close do mesmo id duas vezes termina vazio", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const stopId = activeSheet(state).id;

    state = sheetReducer(state, { type: "close", id: stopId });
    state = sheetReducer(state, { type: "close", id: stopId });

    expect(stackedSheets(state)).toEqual([]);
  });

  it("close de um id que já saiu termina vazio", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const stopId = activeSheet(state).id;
    state = sheetReducer(state, { type: "close", id: stopId });

    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "search" },
    });
    const searchId = activeSheet(state).id;

    // Tenta fechar o stopId que já saiu anteriormente
    state = sheetReducer(state, { type: "close", id: stopId });
    // Fecha a folha atual
    state = sheetReducer(state, { type: "close", id: searchId });

    expect(stackedSheets(state)).toEqual([]);
  });

  it("fechamento de duas folhas na ordem LIFO (topo depois base) termina vazio", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const bottomId = activeSheet(state).id;

    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "search" },
    });
    const topId = activeSheet(state).id;

    // Fecha o do topo primeiro, depois o de baixo
    state = sheetReducer(state, { type: "close", id: topId });
    state = sheetReducer(state, { type: "close", id: bottomId });

    expect(stackedSheets(state)).toEqual([]);
  });

  it("close na ordem trocada (fechar o id de baixo antes do de cima) reproduz a folha fantasma", () => {
    let state = initialSheetState;
    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "stop", stopId: "s1", name: "Ponto 1" },
    });
    const bottomId = activeSheet(state).id;

    state = sheetReducer(state, {
      type: "push",
      sheet: { kind: "search" },
    });
    const topId = activeSheet(state).id;

    // Tenta fechar o de baixo antes do de cima:
    // O reducer ignora porque top.id !== action.id (regra 'só a do topo fecha')
    state = sheetReducer(state, { type: "close", id: bottomId });
    expect(state.stack.some((e) => e.id === bottomId)).toBe(true);

    // Fecha a do topo:
    state = sheetReducer(state, { type: "close", id: topId });

    // A folha de baixo nunca foi removida e agora é o topo fantasma da pilha:
    const ghostSheets = stackedSheets(state);
    expect(ghostSheets).toHaveLength(1);
    expect(ghostSheets[0]?.id).toBe(bottomId);
    expect(ghostSheets[0]?.kind).toBe("stop");
  });
});
