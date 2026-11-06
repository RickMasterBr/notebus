import { describe, expect, it } from "vitest";
import { routeAction } from "./routeAction";

describe("routeAction: toque duplo não abre a mesma tela duas vezes", () => {
  it("push de tela igual à do topo: none", () => {
    const r = routeAction({ type: "push", sheet: { kind: "settings" } }, { screenIds: [1], topScreen: { kind: "settings" } });
    expect(r).toEqual({ to: "nav", op: "none" });
  });
  it("settings de outra page: push", () => {
    const sheet = { kind: "settings", page: "margin" } as const;
    const r = routeAction({ type: "push", sheet }, { screenIds: [1], topScreen: { kind: "settings" } });
    expect(r).toEqual({ to: "nav", op: "push", sheet });
  });
  it("record com outro observationId: push", () => {
    const sheet = { kind: "record", observationId: "o2" } as const;
    const r = routeAction({ type: "push", sheet }, { screenIds: [1], topScreen: { kind: "record", observationId: "o1" } });
    expect(r).toEqual({ to: "nav", op: "push", sheet });
  });
  it("sem topScreen: igual a hoje", () => {
    const sheet = { kind: "settings" } as const;
    expect(routeAction({ type: "push", sheet }, { screenIds: [1] })).toEqual({ to: "nav", op: "push", sheet });
  });
  it("folha com topScreen igual continua popToTopThenSheets", () => {
    const action = { type: "push", sheet: { kind: "stop", stopId: "s", name: "S" } } as const;
    const r = routeAction(action, { screenIds: [1], topScreen: { kind: "stop", stopId: "s", name: "S" } });
    expect(r).toEqual({ to: "nav", op: "popToTopThenSheets", action });
  });
});
