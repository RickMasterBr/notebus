import { describe, expect, it } from "vitest";
import {
  type SheetAction,
  type SheetStackState,
  activeSheet,
  detentFromIndex,
  initialSheetState,
  sheetReducer,
  stackedSheets,
} from "./stack";

const run = (...actions: SheetAction[]): SheetStackState => actions.reduce(sheetReducer, initialSheetState);
const kinds = (s: SheetStackState) => s.stack.map((e) => e.kind);

const stop = (stopId: string, name = "Praça Inventada"): SheetAction => ({
  type: "push",
  sheet: { kind: "stop", stopId, name },
});

describe("pilha de folhas", () => {
  it("começa só com a folha inicial, no detent pequeno", () => {
    expect(kinds(initialSheetState)).toEqual(["home"]);
    expect(activeSheet(initialSheetState).kind).toBe("home");
    expect(initialSheetState.detent).toBe(0);
    expect(stackedSheets(initialSheetState)).toEqual([]);
  });

  it("empilhar põe a folha nova no topo e ela vira a ativa", () => {
    const s = run({ type: "push", sheet: { kind: "search" } });
    expect(kinds(s)).toEqual(["home", "search"]);
    expect(activeSheet(s).kind).toBe("search");
    expect(stackedSheets(s)).toHaveLength(1);
  });

  it("empilhar a mesma folha que já está no topo não duplica", () => {
    const s = run({ type: "push", sheet: { kind: "search" } }, { type: "push", sheet: { kind: "search" } });
    expect(kinds(s)).toEqual(["home", "search"]);
  });

  it("fechar tira só a do topo", () => {
    const s = run({ type: "push", sheet: { kind: "search" } }, { type: "pop" });
    expect(kinds(s)).toEqual(["home"]);
    expect(activeSheet(s).kind).toBe("home");
  });

  it("a folha-base nunca fecha", () => {
    expect(run({ type: "pop" })).toBe(initialSheetState);
    expect(kinds(run({ type: "push", sheet: { kind: "search" } }, { type: "pop" }, { type: "pop" }))).toEqual(["home"]);
  });

  it("trocar substitui a do topo e mantém as de baixo", () => {
    const s = run({ type: "push", sheet: { kind: "search" } }, { type: "replace", sheet: { kind: "search" } });
    expect(kinds(s)).toEqual(["home", "search"]);
    expect(s.stack[1]!.id).not.toBe(run({ type: "push", sheet: { kind: "search" } }).stack[1]!.id);
  });

  it("trocar na base não faz nada", () => {
    expect(run({ type: "replace", sheet: { kind: "search" } })).toBe(initialSheetState);
  });

  it("cada folha empilhada recebe um id novo, mesmo depois de fechar outra", () => {
    const s = run({ type: "push", sheet: { kind: "search" } }, { type: "pop" }, { type: "push", sheet: { kind: "search" } });
    const ids = s.stack.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.stack[1]!.id).toBeGreaterThan(1);
  });

  it("guarda o detent da folha inicial e não o perde ao empilhar e fechar", () => {
    const s = run({ type: "setDetent", detent: 2 }, { type: "push", sheet: { kind: "search" } }, { type: "pop" });
    expect(s.detent).toBe(2);
  });

  it("mudar para o mesmo detent devolve o mesmo estado", () => {
    expect(run({ type: "setDetent", detent: 0 })).toBe(initialSheetState);
  });

  it("detentFromIndex limita a 0, 1 e 2", () => {
    expect([-1, 0, 1, 2, 3].map(detentFromIndex)).toEqual([0, 0, 1, 2, 2]);
  });

  it("a folha de ponto empilha por cima da busca e fechar volta à busca", () => {
    const s = run({ type: "push", sheet: { kind: "search" } }, stop("p1"));
    expect(kinds(s)).toEqual(["home", "search", "stop"]);
    const top = activeSheet(s);
    expect(top.kind === "stop" && [top.stopId, top.name]).toEqual(["p1", "Praça Inventada"]);
    expect(kinds(sheetReducer(s, { type: "pop" }))).toEqual(["home", "search"]);
  });

  it("tocar duas vezes no mesmo ponto não duplica; outro ponto empilha", () => {
    const once = run({ type: "push", sheet: { kind: "search" } }, stop("p1"), stop("p1"));
    expect(kinds(once)).toEqual(["home", "search", "stop"]);
    expect(kinds(sheetReducer(once, stop("p2", "Rua Exemplo")))).toEqual(["home", "search", "stop", "stop"]);
  });
});
