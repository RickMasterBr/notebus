import { describe, expect, it } from "vitest";
import { chooseSuggestedStop, createFreezer } from "./boardSuggestion";
import { createFakePositionPort } from "./devicePosition.fake";
import { createPositionStore } from "./positionStore";

const NOW = 1_800_000_000_000;
const BASE = { lat: 39.7437, lon: -8.8071 };
const north = (id: string, metres: number) => ({ id, lat: BASE.lat + metres / 111_195, lon: BASE.lon });
const fix = (over: Partial<{ accuracyM: number | null; atMs: number }> = {}) => ({ ...BASE, accuracyM: 10, atMs: NOW - 5_000, ...over });
const base = { nowMs: NOW, routineStopId: "rotina", lastUsedStopId: "ultimo", routineRank: new Map<string, number>() };

describe("chooseSuggestedStop", () => {
  it("posição boa perto de um ponto fora da rotina: sugere o ponto pelo GPS", () => {
    expect(chooseSuggestedStop({ ...base, fix: fix(), located: [north("aqui", 30), north("longe", 400)] })).toEqual({ stopId: "aqui", source: "gps" });
  });

  it("posição velha, imprecisa, null ou sem ponto com localização: cai na rotina", () => {
    const located = [north("aqui", 30)];
    const rotina = { stopId: "rotina", source: "routine" };
    expect(chooseSuggestedStop({ ...base, fix: fix({ atMs: NOW - 121_000 }), located })).toEqual(rotina);
    expect(chooseSuggestedStop({ ...base, fix: fix({ accuracyM: 150 }), located })).toEqual(rotina);
    expect(chooseSuggestedStop({ ...base, fix: null, located })).toEqual(rotina);
    expect(chooseSuggestedStop({ ...base, fix: fix(), located: [] })).toEqual(rotina);
    expect(chooseSuggestedStop({ ...base, fix: fix(), located: [north("longe", 400)] })).toEqual(rotina);
  });

  it("sem rotina cai no último ponto usado; sem nada, null", () => {
    expect(chooseSuggestedStop({ ...base, routineStopId: null, fix: null, located: [] })).toEqual({ stopId: "ultimo", source: "routine" });
    expect(chooseSuggestedStop({ ...base, routineStopId: null, lastUsedStopId: null, fix: null, located: [] })).toBeNull();
  });

  it("dois pontos frente a frente: a rotina desempata", () => {
    const located = [north("perto", 10), north("frente", 20)];
    const rank = new Map([["frente", 4], ["perto", 1]]);
    expect(chooseSuggestedStop({ ...base, fix: fix(), located, routineRank: rank })).toEqual({ stopId: "frente", source: "gps" });
  });

  it("T-74: provedor que nunca responde e permissão negada: a escolha sai na hora, pela rotina, sem erro", async () => {
    for (const port of [createFakePositionPort({ next: "never" }), createFakePositionPort({ permissionState: "denied", next: fix() })]) {
      const store = createPositionStore(port);
      void store.warm(); // não esperamos: a abertura da folha nunca espera
      store.askOnce();
      const picked = chooseSuggestedStop({ ...base, fix: store.getFix(), located: [north("aqui", 30)] });
      expect(picked).toEqual({ stopId: "rotina", source: "routine" });
    }
  });
});

describe("createFreezer", () => {
  it("antes de os dados chegarem não decide; depois decide uma vez e a sugestão não muda", () => {
    const freeze = createFreezer<string>();
    expect(freeze(false, () => "x")).toBeUndefined();
    expect(freeze(true, () => "primeira")).toBe("primeira");
    expect(freeze(true, () => "outra posição")).toBe("primeira");
    expect(freeze(false, () => "outra")).toBe("primeira");
  });

  it("com a posição chegando depois da folha aberta, a sugestão fica a da abertura", () => {
    const freeze = createFreezer<ReturnType<typeof chooseSuggestedStop>>();
    const located = [north("aqui", 30)];
    const opened = freeze(true, () => chooseSuggestedStop({ ...base, fix: null, located }));
    const later = freeze(true, () => chooseSuggestedStop({ ...base, fix: fix(), located }));
    expect(opened).toEqual({ stopId: "rotina", source: "routine" });
    expect(later).toBe(opened);
  });
});
