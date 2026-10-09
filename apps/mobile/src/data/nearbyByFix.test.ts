import { describe, expect, it } from "vitest";
import { nearbyStopIdsByFix } from "./nearbyByFix";

const NOW = 1_800_000_000_000;
const BASE = { lat: 39.7437, lon: -8.8071 };
/** Um ponto `metres` ao norte da base (1° de latitude ≈ 111 195 m). */
const north = (id: string, metres: number) => ({ id, lat: BASE.lat + metres / 111_195, lon: BASE.lon });
const fix = (over: Partial<{ accuracyM: number | null; atMs: number }> = {}) => ({ ...BASE, accuracyM: 10, atMs: NOW - 5_000, ...over });

describe("nearbyStopIdsByFix", () => {
  const stops = [north("d", 160), north("c", 140), north("a", 40), north("b", 90)];

  it("três pontos a 40, 90 e 140 m entram em ordem; o de 160 m fica de fora", () => {
    expect(nearbyStopIdsByFix(fix(), NOW, stops)).toEqual(["a", "b", "c"]);
  });
  it("respeita o máximo", () => {
    expect(nearbyStopIdsByFix(fix(), NOW, stops, 2)).toEqual(["a", "b"]);
  });
  it("posição ruim ou null devolve vazio", () => {
    expect(nearbyStopIdsByFix(null, NOW, stops)).toEqual([]);
    expect(nearbyStopIdsByFix(fix({ accuracyM: 101 }), NOW, stops)).toEqual([]);
    expect(nearbyStopIdsByFix(fix({ accuracyM: null }), NOW, stops)).toEqual([]);
    expect(nearbyStopIdsByFix(fix({ atMs: NOW - 121_000 }), NOW, stops)).toEqual([]);
  });
  it("sem pontos com localização devolve vazio", () => {
    expect(nearbyStopIdsByFix(fix(), NOW, [])).toEqual([]);
    expect(nearbyStopIdsByFix(fix(), NOW, [{ id: "x", lat: null, lon: null }, { id: "y", lat: 39.7, lon: null }])).toEqual([]);
  });
});
