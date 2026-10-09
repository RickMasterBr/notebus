import { describe, expect, it } from "vitest";
import { distanceM, medianPoint } from "./geo.ts";

// T-68. Coordenadas INVENTADAS (D-091). Valores de referência calculados à parte, por um script Python independente
// (math.sin/asin, raio 6.371.008,8 m); não vêm de calculadora de terceiros.

describe("T-68: distância (haversine)", () => {
  it("0,001° de latitude vale 111,2 m (erro até 0,5 m)", () => {
    expect(Math.abs(distanceM({ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }) - 111.2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(distanceM({ lat: 39.7437, lon: -8.8071 }, { lat: 39.7447, lon: -8.8071 }) - 111.2)).toBeLessThanOrEqual(0.5);
  });

  it("mesma coordenada dá 0", () => {
    expect(distanceM({ lat: 39.7437, lon: -8.8071 }, { lat: 39.7437, lon: -8.8071 })).toBe(0);
  });

  it("é simétrica", () => {
    const a = { lat: 39.744, lon: -8.807 };
    const b = { lat: 39.746, lon: -8.803 };
    expect(distanceM(a, b)).toBe(distanceM(b, a));
  });

  it("dois pares de Leiria (inventados) com erro até 1 m", () => {
    expect(Math.abs(distanceM({ lat: 39.744, lon: -8.807 }, { lat: 39.746, lon: -8.803 }) - 407.94)).toBeLessThanOrEqual(1);
    expect(Math.abs(distanceM({ lat: 39.74, lon: -8.81 }, { lat: 39.75, lon: -8.8 }) - 1402.65)).toBeLessThanOrEqual(1);
  });
});

describe("medianPoint", () => {
  it("mediana de latitude e de longitude separadas, resistente a um ponto fora", () => {
    const m = medianPoint([
      { lat: 39.7, lon: -8.8 },
      { lat: 39.9, lon: -8.6 },
      { lat: 39.8, lon: -8.9 },
    ]);
    expect(m).toEqual({ lat: 39.8, lon: -8.8 });
  });
  it("com número par, a média dos dois do meio; com lista vazia, erro", () => {
    expect(medianPoint([{ lat: 1, lon: 1 }, { lat: 3, lon: 5 }])).toEqual({ lat: 2, lon: 3 });
    expect(() => medianPoint([])).toThrow();
  });
});
