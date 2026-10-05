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

describe("stack.e04 (TL-06 e TL-09)", () => {
  it("empilha record (TL-06) e verify (TL-09)", () => {
    const s1 = run({ type: "push", sheet: { kind: "record", observationId: "obs-1" } });
    expect(kinds(s1)).toEqual(["home", "record"]);
    expect(activeSheet(s1)).toMatchObject({ kind: "record", observationId: "obs-1" });

    const s2 = run({ type: "push", sheet: { kind: "verify", observationId: "obs-2" } });
    expect(kinds(s2)).toEqual(["home", "verify"]);
    expect(activeSheet(s2)).toMatchObject({ kind: "verify", observationId: "obs-2" });
  });

  it("empilhar o mesmo record ou verify não duplica", () => {
    const sRecord = run(
      { type: "push", sheet: { kind: "record", observationId: "obs-1" } },
      { type: "push", sheet: { kind: "record", observationId: "obs-1" } },
    );
    expect(kinds(sRecord)).toEqual(["home", "record"]);
    expect(stackedSheets(sRecord)).toHaveLength(1);

    const sVerify = run(
      { type: "push", sheet: { kind: "verify", observationId: "obs-2" } },
      { type: "push", sheet: { kind: "verify", observationId: "obs-2" } },
    );
    expect(kinds(sVerify)).toEqual(["home", "verify"]);
    expect(stackedSheets(sVerify)).toHaveLength(1);
  });

  it("empilhar record com observationId diferente empilha ambas", () => {
    const s = run(
      { type: "push", sheet: { kind: "record", observationId: "obs-1" } },
      { type: "push", sheet: { kind: "record", observationId: "obs-2" } },
    );
    expect(kinds(s)).toEqual(["home", "record", "record"]);
    expect(stackedSheets(s)).toHaveLength(2);
    expect(activeSheet(s)).toMatchObject({ kind: "record", observationId: "obs-2" });
  });

  it("replace do topo: TL-09 troca pela TL-06 no 'Corrigir a hora', e fechar a TL-06 volta ao Início", () => {
    // 1. Abre a TL-09 de obs-1
    const s1 = run({ type: "push", sheet: { kind: "verify", observationId: "obs-1" } });
    expect(kinds(s1)).toEqual(["home", "verify"]);

    // 2. 'Corrigir a hora' faz replace pela TL-06 do mesmo registro
    const s2 = sheetReducer(s1, { type: "replace", sheet: { kind: "record", observationId: "obs-1" } });
    expect(kinds(s2)).toEqual(["home", "record"]);
    expect(activeSheet(s2)).toMatchObject({ kind: "record", observationId: "obs-1" });

    // 3. Fechar a TL-06 volta ao Início
    const s3 = sheetReducer(s2, { type: "close", id: activeSheet(s2).id });
    expect(kinds(s3)).toEqual(["home"]);
    expect(activeSheet(s3).kind).toBe("home");
  });

  it("fechar por id: fecha apenas a folha correspondente do topo", () => {
    const s1 = run({ type: "push", sheet: { kind: "record", observationId: "obs-1" } });
    const topId = activeSheet(s1).id;

    // Fechar com id errado não fecha
    const sNotClosed = sheetReducer(s1, { type: "close", id: 9999 });
    expect(kinds(sNotClosed)).toEqual(["home", "record"]);

    // Fechar com id correto fecha
    const sClosed = sheetReducer(s1, { type: "close", id: topId });
    expect(kinds(sClosed)).toEqual(["home"]);
  });
});
