import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "./config.ts";
import { distanceM, type PositionFix } from "./geo.ts";
import { nearestPlace, suggestStop } from "./nearby.ts";

// T-63 a T-66. Coordenadas INVENTADAS (D-091). Os pontos ficam no mesmo meridiano, então a distância é só a diferença de
// latitude: `metersToDegrees` converte (1° de latitude ≈ 111.194,9 m).
const NOW = 1_800_000_000_000;
const BASE = { lat: 39.74, lon: -8.8 };
const metersToDegrees = (m: number) => m / 111_194.9;
const north = (m: number) => ({ lat: BASE.lat + metersToDegrees(m), lon: BASE.lon });
const stopAt = (id: string, m: number) => ({ id, ...north(m) });
const fixAt = (m: number, over: Partial<PositionFix> = {}): PositionFix => ({ ...north(m), accuracyM: 20, atMs: NOW - 5_000, ...over });
const NO_RANK = new Map<string, number>();

describe("T-63: ponto sugerido pela posição", () => {
  it("80 m de A e 140 m de B, precisão 20 m → A", () => {
    // A a 0 m, B a 220 m; posição a 80 m de A (norte) fica a 140 m de B.
    const stops = [stopAt("A", 0), stopAt("B", 220)];
    expect(suggestStop(fixAt(80), NOW, stops, NO_RANK)).toEqual({ stopId: "A", viaTiebreak: false });
  });

  it("160 m de ambos → sem candidato", () => {
    const stops = [stopAt("A", 0), stopAt("B", 320)];
    expect(suggestStop(fixAt(160), NOW, stops, NO_RANK)).toBeNull();
  });

  it("ponto exatamente no raio entra, 0,1 m além fica fora", () => {
    const stop = { id: "A", ...BASE };
    const edge = fixAt(150);
    const exact = { ...DOMAIN_CONFIG, nearRadiusM: distanceM(edge, stop) };
    expect(suggestStop(edge, NOW, [stop], NO_RANK, exact)?.stopId).toBe("A");
    expect(suggestStop(fixAt(149.9), NOW, [stop], NO_RANK)?.stopId).toBe("A");
    expect(distanceM(fixAt(150.1), stop)).toBeGreaterThan(150);
    expect(suggestStop(fixAt(150.1), NOW, [stop], NO_RANK)).toBeNull();
  });

  it("ignora pontos sem localização", () => {
    const stops = [{ id: "S", lat: null, lon: null }, { id: "P", lat: BASE.lat, lon: null }, stopAt("A", 50)];
    expect(suggestStop(fixAt(0), NOW, stops, NO_RANK)?.stopId).toBe("A");
  });
});

describe("T-64: frente a frente", () => {
  // Estádio a 0 m e Terminal a 20 m um do outro; posição a 8 m do Estádio e a 12 m do Terminal.
  const pair = [stopAt("estadio", 0), stopAt("terminal", 20)];

  it("a rotina prefere o segundo → o segundo, via desempate", () => {
    expect(suggestStop(fixAt(8), NOW, pair, new Map([["terminal", 5], ["estadio", 2]]))).toEqual({ stopId: "terminal", viaTiebreak: true });
  });

  it("a rotina prefere o primeiro → o primeiro, mesmo sendo o mais perto ou não", () => {
    expect(suggestStop(fixAt(8), NOW, pair, new Map([["estadio", 5]]))).toEqual({ stopId: "estadio", viaTiebreak: true });
    expect(suggestStop(fixAt(16), NOW, pair, new Map([["estadio", 5]]))).toEqual({ stopId: "estadio", viaTiebreak: true });
  });

  it("empate de rotina (ou ausente) → o mais perto da posição", () => {
    expect(suggestStop(fixAt(16), NOW, pair, NO_RANK)).toEqual({ stopId: "terminal", viaTiebreak: true });
    expect(suggestStop(fixAt(4), NOW, pair, new Map([["estadio", 3], ["terminal", 3]]))).toEqual({ stopId: "estadio", viaTiebreak: true });
  });

  it("dois pontos a 40 m → vence o mais perto, sem desempate", () => {
    const far = [stopAt("estadio", 0), stopAt("terminal", 40)];
    expect(suggestStop(fixAt(10), NOW, far, new Map([["terminal", 9]]))).toEqual({ stopId: "estadio", viaTiebreak: false });
  });

  it("exatamente 25 m um do outro não é frente a frente (menos de 25)", () => {
    const edge = [stopAt("a", 0), stopAt("b", 25.5)];
    expect(suggestStop(fixAt(5), NOW, edge, new Map([["b", 9]]))).toEqual({ stopId: "a", viaTiebreak: false });
  });

  it("três candidatos frente a frente → a regra vale entre os que estão a menos de 25 m do mais perto", () => {
    const three = [stopAt("a", 0), stopAt("b", 10), stopAt("c", 20)];
    // O mais perto de uma posição a 9 m é b (1 m); a e c estão a 10 m dele.
    expect(suggestStop(fixAt(9), NOW, three, new Map([["c", 4], ["a", 1]]))).toEqual({ stopId: "c", viaTiebreak: true });
    // Um quarto ponto a 60 m do b não entra no grupo, mesmo com rotina alta.
    const withFar = [...three, stopAt("d", 70)];
    expect(suggestStop(fixAt(9), NOW, withFar, new Map([["d", 99]]))).toEqual({ stopId: "b", viaTiebreak: true });
  });
});

describe("T-65: leitura inválida → null (o chamador cai na rotina)", () => {
  const stops = [stopAt("A", 0)];
  it("precisão 300 m", () => expect(suggestStop(fixAt(0, { accuracyM: 300 }), NOW, stops, NO_RANK)).toBeNull());
  it("precisão desconhecida (null)", () => expect(suggestStop(fixAt(0, { accuracyM: null }), NOW, stops, NO_RANK)).toBeNull());
  it("precisão no limite de 100 m ainda vale", () => expect(suggestStop(fixAt(0, { accuracyM: 100 }), NOW, stops, NO_RANK)?.stopId).toBe("A"));
  it("posição de 3 minutos atrás", () => expect(suggestStop(fixAt(0, { atMs: NOW - 180_000 }), NOW, stops, NO_RANK)).toBeNull());
  it("posição de exatamente 2 minutos atrás ainda vale", () => expect(suggestStop(fixAt(0, { atMs: NOW - 120_000 }), NOW, stops, NO_RANK)?.stopId).toBe("A"));
  it("posição do futuro além de 5 s é relógio estranho; até 5 s vale", () => {
    expect(suggestStop(fixAt(0, { atMs: NOW + 5_001 }), NOW, stops, NO_RANK)).toBeNull();
    expect(suggestStop(fixAt(0, { atMs: NOW + 5_000 }), NOW, stops, NO_RANK)?.stopId).toBe("A");
  });
  it("nenhum ponto com localização", () => expect(suggestStop(fixAt(0), NOW, [{ id: "S", lat: null, lon: null }], NO_RANK)).toBeNull());
  it("sem posição", () => expect(suggestStop(null, NOW, stops, NO_RANK)).toBeNull());
});

describe("T-66: lugar perto", () => {
  const casa = stopAt("casa", 0);
  const facul = stopAt("facul", 210);

  it("Casa a 90 m e Facul a 120 m → Casa (o mais perto)", () => {
    expect(nearestPlace(fixAt(90), NOW, [facul, casa])?.id).toBe("casa");
  });
  it("só Facul a 140 m → Facul", () => {
    expect(nearestPlace(fixAt(70), NOW, [{ ...facul, id: "facul" }, { id: "casa", lat: null, lon: null }])).toEqual(expect.objectContaining({ id: "facul" }));
  });
  it("nenhum a menos de 150 m → null (vale a regra de uso da E-05)", () => {
    expect(nearestPlace(fixAt(500), NOW, [casa, facul])).toBeNull();
  });
  it("mesmas regras de validade do fix", () => {
    expect(nearestPlace(fixAt(0, { accuracyM: 101 }), NOW, [casa])).toBeNull();
    expect(nearestPlace(fixAt(0, { accuracyM: null }), NOW, [casa])).toBeNull();
    expect(nearestPlace(fixAt(0, { atMs: NOW - 120_001 }), NOW, [casa])).toBeNull();
    expect(nearestPlace(fixAt(0, { atMs: NOW + 6_000 }), NOW, [casa])).toBeNull();
    expect(nearestPlace(null, NOW, [casa])).toBeNull();
  });
});
