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

describe("stack.e05 (TL-10 Lugares e trajetos)", () => {
  it("empilha a hierarquia completa: places → place → route → option → alightPicker", () => {
    const s = run(
      { type: "push", sheet: { kind: "places" } },
      { type: "push", sheet: { kind: "place", placeId: "place-1" } },
      { type: "push", sheet: { kind: "route", routeId: "route-1" } },
      { type: "push", sheet: { kind: "option", routeId: "route-1", optionId: "opt-1" } },
      { type: "push", sheet: { kind: "alightPicker", routeId: "route-1", patternId: "pat-1", boardPosition: 2 } },
    );
    expect(kinds(s)).toEqual(["home", "places", "place", "route", "option", "alightPicker"]);
    expect(activeSheet(s)).toMatchObject({ kind: "alightPicker", patternId: "pat-1", boardPosition: 2 });
  });

  it("empilhar a mesma folha não duplica na pilha", () => {
    const sPlaces = run(
      { type: "push", sheet: { kind: "places" } },
      { type: "push", sheet: { kind: "places" } },
    );
    expect(kinds(sPlaces)).toEqual(["home", "places"]);
    expect(stackedSheets(sPlaces)).toHaveLength(1);

    const sPlace = run(
      { type: "push", sheet: { kind: "place", placeId: "place-1" } },
      { type: "push", sheet: { kind: "place", placeId: "place-1" } },
    );
    expect(kinds(sPlace)).toEqual(["home", "place"]);
    expect(stackedSheets(sPlace)).toHaveLength(1);

    const sRoute = run(
      { type: "push", sheet: { kind: "route", routeId: "route-1" } },
      { type: "push", sheet: { kind: "route", routeId: "route-1" } },
    );
    expect(kinds(sRoute)).toEqual(["home", "route"]);
    expect(stackedSheets(sRoute)).toHaveLength(1);

    const sOption = run(
      { type: "push", sheet: { kind: "option", routeId: "route-1", optionId: "opt-1" } },
      { type: "push", sheet: { kind: "option", routeId: "route-1", optionId: "opt-1" } },
    );
    expect(kinds(sOption)).toEqual(["home", "option"]);
    expect(stackedSheets(sOption)).toHaveLength(1);

    const sAlight = run(
      { type: "push", sheet: { kind: "alightPicker", routeId: "route-1", patternId: "pat-1", boardPosition: 2 } },
      { type: "push", sheet: { kind: "alightPicker", routeId: "route-1", patternId: "pat-1", boardPosition: 2 } },
    );
    expect(kinds(sAlight)).toEqual(["home", "alightPicker"]);
    expect(stackedSheets(sAlight)).toHaveLength(1);
  });

  it("empilhar place ou option diferentes empilha ambas", () => {
    const s = run(
      { type: "push", sheet: { kind: "place", placeId: "place-1" } },
      { type: "push", sheet: { kind: "place", placeId: "place-2" } },
    );
    expect(kinds(s)).toEqual(["home", "place", "place"]);
    expect(stackedSheets(s)).toHaveLength(2);
  });

  it("fechando folhas desempilha na ordem correta até home", () => {
    let s = run(
      { type: "push", sheet: { kind: "places" } },
      { type: "push", sheet: { kind: "place", placeId: "place-1" } },
      { type: "push", sheet: { kind: "route", routeId: "route-1" } },
    );
    expect(kinds(s)).toEqual(["home", "places", "place", "route"]);

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "places", "place"]);

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home", "places"]);

    s = step(s, POP);
    expect(kinds(s)).toEqual(["home"]);
  });

  it("empilha TL-04 'goto' (Ir para X) e não duplica mesma folha", () => {
    const s = run(
      { type: "push", sheet: { kind: "goto", destinationPlaceId: "p-shopping", originPlaceId: "p-casa" } },
      { type: "push", sheet: { kind: "goto", destinationPlaceId: "p-shopping", originPlaceId: "p-casa" } },
    );
    expect(kinds(s)).toEqual(["home", "goto"]);
    expect(activeSheet(s)).toMatchObject({
      kind: "goto",
      destinationPlaceId: "p-shopping",
      originPlaceId: "p-casa",
    });

    // Destino diferente empilha
    const sDiff = step(s, {
      type: "push",
      sheet: { kind: "goto", destinationPlaceId: "p-facul" },
    });
    expect(kinds(sDiff)).toEqual(["home", "goto", "goto"]);

    // Fecha volta para o primeiro goto
    const sPopped = step(sDiff, POP);
    expect(kinds(sPopped)).toEqual(["home", "goto"]);
    expect(activeSheet(sPopped)).toMatchObject({ destinationPlaceId: "p-shopping" });
  });

  it("empilha folha place com initialName ('Casa') a partir do Início vazio", () => {
    const s = run({
      type: "push",
      sheet: { kind: "place", initialName: "Casa" },
    });
    expect(kinds(s)).toEqual(["home", "place"]);
    expect(activeSheet(s)).toMatchObject({
      kind: "place",
      initialName: "Casa",
    });
  });

  it("cobre a igualdade/mesma folha para option em modo rascunho (Item 2)", () => {
    // 1. Empilhar a mesma folha rascunho não duplica na pilha
    const sDraft = run(
      { type: "push", sheet: { kind: "option", originPlaceId: "p-casa", destinationPlaceId: "p-facul" } },
      { type: "push", sheet: { kind: "option", originPlaceId: "p-casa", destinationPlaceId: "p-facul" } },
    );
    expect(kinds(sDraft)).toEqual(["home", "option"]);
    expect(stackedSheets(sDraft)).toHaveLength(1);
    expect(activeSheet(sDraft)).toMatchObject({
      kind: "option",
      originPlaceId: "p-casa",
      destinationPlaceId: "p-facul",
    });

    // 2. Destinos/origens diferentes empilham ambas
    const sDiff = step(sDraft, {
      type: "push",
      sheet: { kind: "option", originPlaceId: "p-casa", destinationPlaceId: "p-academia" },
    });
    expect(kinds(sDiff)).toEqual(["home", "option", "option"]);
    expect(stackedSheets(sDiff)).toHaveLength(2);

    // 3. Option com routeId vs option rascunho são folhas diferentes e empilham
    const sRouteOpt = step(sDiff, {
      type: "push",
      sheet: { kind: "option", routeId: "route-1" },
    });
    expect(kinds(sRouteOpt)).toEqual(["home", "option", "option", "option"]);
    expect(stackedSheets(sRouteOpt)).toHaveLength(3);
  });
});
