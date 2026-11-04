import { describe, expect, it } from "vitest";
import type { SheetAction } from "../sheets/stack";
import { routeAction } from "./routeAction";

const none = { screenIds: [] as number[] };
const onScreen = { screenIds: [1_000_000, 1_000_001] };
const pushSettings: SheetAction = { type: "push", sheet: { kind: "settings" } };
const pushStop: SheetAction = { type: "push", sheet: { kind: "stop", stopId: "s", name: "n" } };

describe("routeAction", () => {
  it("push de tela empilha a rota tela", () => {
    expect(routeAction(pushSettings, none)).toEqual({ to: "nav", op: "push", sheet: { kind: "settings" } });
    expect(routeAction(pushSettings, onScreen)).toEqual({ to: "nav", op: "push", sheet: { kind: "settings" } });
  });
  it("push de folha sem tela em foco vai para as folhas", () => {
    expect(routeAction(pushStop, none)).toEqual({ to: "sheets", action: pushStop });
  });
  it("push de folha com tela em foco volta ao Início e depois empilha a folha", () => {
    expect(routeAction(pushStop, onScreen)).toEqual({ to: "nav", op: "popToTopThenSheets", action: pushStop });
  });
  it("close do id da tela do topo volta uma tela", () => {
    expect(routeAction({ type: "close", id: 1_000_001 }, onScreen)).toEqual({ to: "nav", op: "goBack" });
  });
  it("close de tela que não é a do topo não faz nada", () => {
    expect(routeAction({ type: "close", id: 1_000_000 }, onScreen)).toEqual({ to: "nav", op: "none" });
  });
  it("close de id de folha vai para as folhas", () => {
    const close: SheetAction = { type: "close", id: 3 };
    expect(routeAction(close, none)).toEqual({ to: "sheets", action: close });
    expect(routeAction(close, onScreen)).toEqual({ to: "sheets", action: close });
  });
  it("replace com tela no topo troca a tela", () => {
    const replace: SheetAction = { type: "replace", sheet: { kind: "place" } };
    expect(routeAction(replace, onScreen)).toEqual({ to: "nav", op: "replace", sheet: { kind: "place" } });
  });
  it("replace sem tela vai para as folhas", () => {
    const replace: SheetAction = { type: "replace", sheet: { kind: "stop", stopId: "s", name: "n" } };
    expect(routeAction(replace, none)).toEqual({ to: "sheets", action: replace });
  });
  it("setDetent vai para as folhas sem mudança", () => {
    const a: SheetAction = { type: "setDetent", detent: 1 };
    expect(routeAction(a, onScreen)).toEqual({ to: "sheets", action: a });
  });
});
