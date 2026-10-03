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

/** `POP` = fechar a folha que está no topo agora (o id é lido do estado); `closeId(n)` = aviso de fechamento de uma folha específica. */
const POP = Symbol("pop");
type Step = SheetAction | typeof POP;
const closeId = (id: number): SheetAction => ({ type: "close", id });
const step = (s: SheetStackState, a: Step): SheetStackState =>
  sheetReducer(s, a === POP ? closeId(activeSheet(s).id) : a);
const run = (...actions: Step[]): SheetStackState => actions.reduce(step, initialSheetState);
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
    const s = run({ type: "push", sheet: { kind: "search" } }, POP);
    expect(kinds(s)).toEqual(["home"]);
    expect(activeSheet(s).kind).toBe("home");
  });

  it("a folha-base nunca fecha", () => {
    expect(run(POP)).toBe(initialSheetState);
    expect(kinds(run({ type: "push", sheet: { kind: "search" } }, POP, POP))).toEqual(["home"]);
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
    const s = run({ type: "push", sheet: { kind: "search" } }, POP, { type: "push", sheet: { kind: "search" } });
    const ids = s.stack.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.stack[1]!.id).toBeGreaterThan(1);
  });

  it("guarda o detent da folha inicial e não o perde ao empilhar e fechar", () => {
    const s = run({ type: "setDetent", detent: 2 }, { type: "push", sheet: { kind: "search" } }, POP);
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
    expect(kinds(step(s, POP))).toEqual(["home", "search"]);
  });

  it("a TL-05 empilha por cima do Ponto; tocar de novo na mesma passagem não duplica, outra passagem empilha", () => {
    const ahead = (tripId: string, position: number): SheetAction => ({ type: "push", sheet: { kind: "ahead", tripId, position } });
    const onStop = run(stop("a"), ahead("v1", 6));
    expect(kinds(onStop)).toEqual(["home", "stop", "ahead"]);
    expect(kinds(step(onStop, ahead("v1", 6)))).toEqual(["home", "stop", "ahead"]);
    expect(kinds(step(onStop, ahead("v1", 12)))).toEqual(["home", "stop", "ahead", "ahead"]);
    expect(kinds(step(onStop, POP))).toEqual(["home", "stop"]); // fechar volta ao Ponto, que continua por baixo
  });

  it("tocar duas vezes no mesmo ponto não duplica; outro ponto empilha", () => {
    const once = run({ type: "push", sheet: { kind: "search" } }, stop("p1"), stop("p1"));
    expect(kinds(once)).toEqual(["home", "search", "stop"]);
    expect(kinds(sheetReducer(once, stop("p2", "Rua Exemplo")))).toEqual(["home", "search", "stop", "stop"]);
  });

  describe("bug do teste 1b: a Busca parou de abrir", () => {
    const search: SheetAction = { type: "push", sheet: { kind: "search" } };
    const key = (s: SheetStackState) => s.stack.map((e) => (e.kind === "stop" ? `stop:${e.stopId}` : e.kind));

    it("Busca -> 4º ponto -> 5º ponto: a Busca fica por baixo, o ponto por cima", () => {
      let s = run(search, stop("p4"));
      expect(key(s)).toEqual(["home", "search", "stop:p4"]);
      s = step(s, POP);
      expect(key(s)).toEqual(["home", "search"]);
      s = step(s, stop("p5"));
      expect(key(s)).toEqual(["home", "search", "stop:p5"]);
    });

    it("aviso de fechamento da Busca com o ponto por cima não derruba nada", () => {
      const s = run(search, stop("p4"));
      const searchId = s.stack[1]!.id;
      expect(sheetReducer(s, closeId(searchId))).toBe(s);
    });

    it("fechamento em dobro da mesma folha fecha uma vez só", () => {
      const s = run(search, stop("p4"));
      const stopId = s.stack[2]!.id;
      const once = sheetReducer(s, closeId(stopId));
      expect(key(once)).toEqual(["home", "search"]);
      expect(sheetReducer(once, closeId(stopId))).toBe(once);
    });

    it("aviso atrasado de uma folha que já saiu não fecha a que está no topo", () => {
      const s = run(search, stop("p4"));
      const stopId = s.stack[2]!.id;
      const after = run(search, stop("p4"), POP, stop("p5"));
      expect(key(sheetReducer(after, closeId(stopId)))).toEqual(["home", "search", "stop:p5"]);
    });

    it("empilhar a Busca quando ela já está por baixo traz uma só, para o topo", () => {
      const s = run(search, stop("p4"), search);
      expect(key(s)).toEqual(["home", "stop:p4", "search"]);
    });

    it("empilhar a mesma Busca no topo não duplica nem ignora o estado", () => {
      const s = run(search);
      expect(sheetReducer(s, search)).toBe(s);
    });

    it("invariante: nunca há a mesma folha duas vezes, e a base é sempre a primeira", () => {
      const stops = ["a", "b", "c"].map((id) => stop(id));
      const seqs: Step[][] = [
        [search, stops[0]!, search, stops[0]!, POP, search, POP, POP],
        [stops[0]!, stops[1]!, stops[0]!, search, search, POP, stops[2]!, stops[2]!],
      ];
      for (const seq of seqs) {
        let s = initialSheetState;
        for (const a of seq) {
          s = step(s, a);
          const ids = s.stack.map((e) => e.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(new Set(key(s)).size).toBe(s.stack.length);
          expect(s.stack[0]!.kind).toBe("home");
        }
      }
    });
  });
});
