import { describe, expect, it } from "vitest";
import { type GhostInput, REVEAL_CHECK_MS, isGhostSuspect, repairStep, settledIndex } from "./ghostRepair";

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
    ["folha do ponto expandida (assentou no detent 2) e ainda no 2: não suspeita", { index: 2, expectedIndex: 2 }, false],
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

describe("settledIndex", () => {
  it.each<[string, number, number, number]>([
    ["próximo válido assume (folha expandida ao detent 2)", 0, 2, 2],
    ["volta ao detent menor", 2, 0, 0],
    ["0 é um índice válido", 1, 0, 0],
    ["-1 (fechada) mantém o anterior", 2, -1, 2],
    ["-1 com anterior 0 mantém 0", 0, -1, 0],
  ])("%s", (_nome, previous, next, esperado) => {
    expect(settledIndex(previous, next)).toBe(esperado);
  });
});

describe("REVEAL_CHECK_MS", () => {
  it("fica em 350 ms (valor de produto)", () => {
    expect(REVEAL_CHECK_MS).toBe(350);
  });
});
