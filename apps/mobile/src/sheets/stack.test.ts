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

describe("folhas de Ajustes e do seletor do relógio (D-151)", () => {
  it("Ajustes → seletor empilham, nunca duplicam, e fecham de cima para baixo", () => {
    let s = sheetReducer(initialSheetState, { type: "push", sheet: { kind: "settings" } });
    s = sheetReducer(s, { type: "push", sheet: { kind: "settings" } });
    expect(stackedSheets(s).map((e) => e.kind)).toEqual(["settings"]);
    s = sheetReducer(s, { type: "push", sheet: { kind: "clockPicker" } });
    expect(stackedSheets(s).map((e) => e.kind)).toEqual(["settings", "clockPicker"]);
    s = sheetReducer(s, { type: "close", id: activeSheet(s).id });
    expect(activeSheet(s).kind).toBe("settings");
  });
});

describe("5e, tarefa 4: a sequência da gaveta presa (home > stop > ahead > settings > clockPicker)", () => {
  const ahead: SheetAction = { type: "push", sheet: { kind: "ahead", tripId: "t1", position: 3 } };
  const settings: SheetAction = { type: "push", sheet: { kind: "settings" } };
  const clockPicker: SheetAction = { type: "push", sheet: { kind: "clockPicker" } };
  /** O que a tela mostra: só a folha do topo recebe toque; as outras ficam cobertas (sem eventos). */
  const covered = (s: SheetStackState) => s.stack.slice(0, -1).map((e) => e.kind);

  it("empilha cinco folhas, fecha o seletor e abre outro ponto: uma folha no topo, ids únicos, as outras cobertas", () => {
    let s = run(stop("a", "Campus"), ahead, settings, clockPicker);
    expect(kinds(s)).toEqual(["home", "stop", "ahead", "settings", "clockPicker"]);
    s = step(s, POP);
    expect(activeSheet(s).kind).toBe("settings");
    s = step(s, stop("b", "Estádio"));
    expect(kinds(s)).toEqual(["home", "stop", "ahead", "settings", "stop"]);
    expect(activeSheet(s)).toMatchObject({ kind: "stop", stopId: "b" });
    expect(covered(s)).toEqual(["home", "stop", "ahead", "settings"]);
    expect(new Set(s.stack.map((e) => e.id)).size).toBe(s.stack.length);
  });

  it("fechar uma a uma volta à base, sem sobrar folha; avisos repetidos e atrasados não derrubam outra", () => {
    let s = run(stop("a"), ahead, settings, clockPicker);
    const ids = s.stack.map((e) => e.id);
    s = step(s, POP);
    s = step(s, closeId(ids[4]!)); // aviso atrasado da folha que já saiu
    expect(kinds(s)).toEqual(["home", "stop", "ahead", "settings"]);
    s = step(step(step(s, POP), POP), POP);
    expect(kinds(s)).toEqual(["home"]);
  });

  it("abrir de novo o mesmo ponto que está por baixo traz a folha para o topo, sem duplicar", () => {
    let s = run(stop("a"), ahead, settings, clockPicker);
    s = step(s, POP);
    s = step(s, stop("a"));
    expect(kinds(s)).toEqual(["home", "ahead", "settings", "stop"]);
    expect(s.stack.filter((e) => e.kind === "stop")).toHaveLength(1);
  });

  it("E-03: Registrar abre sobre o Início; 'Trocar' empilha a Busca em modo pick; fechar uma a uma volta ao Registrar", () => {
    const board: SheetAction = { type: "push", sheet: { kind: "board", stopId: null } };
    const pick: SheetAction = { type: "push", sheet: { kind: "search", pick: true } };
    let s = run(board, pick);
    expect(kinds(s)).toEqual(["home", "board", "search"]);
    expect(activeSheet(s)).toMatchObject({ kind: "search", pick: true });
    s = step(s, POP);
    expect(activeSheet(s)).toMatchObject({ kind: "board", stopId: null });
    // Duplo toque no botão Registrar: a mesma folha não entra duas vezes.
    expect(kinds(step(s, board))).toEqual(["home", "board"]);
  });

  it("E-03: o 'Registrar aqui' do Ponto empilha o Registrar com o ponto; 'Desci aqui' e o cartão puxado abrem por cima do Início", () => {
    let s = run(stop("a"), { type: "push", sheet: { kind: "board", stopId: "a" } });
    expect(activeSheet(s)).toMatchObject({ kind: "board", stopId: "a" });
    expect(covered(s)).toEqual(["home", "stop"]);
    s = run({ type: "push", sheet: { kind: "alight" } });
    expect(kinds(s)).toEqual(["home", "alight"]);
    s = run({ type: "push", sheet: { kind: "trip" } });
    expect(kinds(s)).toEqual(["home", "trip"]);
  });
});

describe("E-03 bloco 3: prévia da importação do backup", () => {
  it("abre por cima de Ajustes; fechar volta a Ajustes; duas vezes seguidas não empilha duas", () => {
    const settings: SheetAction = { type: "push", sheet: { kind: "settings" } };
    const preview: SheetAction = { type: "push", sheet: { kind: "backupImport" } };
    let s = run(settings, preview);
    expect(kinds(s)).toEqual(["home", "settings", "backupImport"]);
    expect(kinds(step(s, preview))).toEqual(["home", "settings", "backupImport"]);
    s = step(s, { type: "close", id: activeSheet(s).id });
    expect(kinds(s)).toEqual(["home", "settings"]);
  });
});
