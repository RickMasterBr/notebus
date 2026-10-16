import { describe, expect, it } from "vitest";
import { type GhostInput, isGhostSuspect, repairStep } from "./ghostRepair";

const base: GhostInput = { isTop: true, hasBeenCovered: true, position: 300, index: 0, screenHeight: 800, expectedIndex: 0 };

describe("isGhostSuspect", () => {
  it.each<[string, Partial<GhostInput>, boolean]>([
    ["topo e nunca coberta: nunca suspeita", { hasBeenCovered: false, position: 800, index: -1 }, false],
    ["topo, coberta, na tela e índice certo: não suspeita", {}, false],
    ["topo, coberta, posição fora da tela: suspeita", { position: 800 }, true],
    ["posição a 4 px do fim da tela: suspeita", { position: 796 }, true],
    ["posição a 5 px do fim da tela: não suspeita", { position: 795 }, false],
    ["índice -1 com esperado 0: suspeita", { index: -1 }, true],
    ["índice diferente do esperado (detent 1 com esperado 0): suspeita", { index: 1 }, true],
    ["índice igual ao esperado 1: não suspeita", { index: 1, expectedIndex: 1 }, false],
    ["não topo: nunca suspeita", { isTop: false, position: 800, index: -1 }, false],
  ])("%s", (_nome, patch, esperado) => {
    expect(isGhostSuspect({ ...base, ...patch })).toBe(esperado);
  });
});

describe("repairStep", () => {
  it("sequência: snap, remount, stop", () => {
    expect([0, 1, 2, 3].map(repairStep)).toEqual(["snap", "remount", "stop", "stop"]);
  });
});
