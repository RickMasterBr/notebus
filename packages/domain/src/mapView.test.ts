import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "./config.ts";
import type { PositionFix } from "./geo.ts";
import { chooseMapOpening } from "./mapView.ts";

// T-67. Coordenadas INVENTADAS (D-091). Deslocamentos em metros ao norte de BASE (1° de latitude ≈ 111.194,9 m).
const BASE = { lat: 39.74, lon: -8.8 };
const north = (m: number) => ({ lat: BASE.lat + m / 111_194.9, lon: BASE.lon });
const NOW = 1_000_000_000;
const HOME = { lat: 39.75, lon: -8.79 };
const LAST = { lat: 39.73, lon: -8.81 };
const LISBON = { lat: 38.72, lon: -9.14 };
const gpsFix = (over: Partial<PositionFix> = {}): PositionFix => ({ ...north(100), accuracyM: 20, atMs: NOW - 5_000, ...over });
const open = (fix: PositionFix | null, home: typeof HOME | null, last: typeof LAST | null) =>
  chooseMapOpening({ fix, nowMs: NOW, home, lastMapPosition: last });

describe("T-67: onde o mapa abre", () => {
  it("(a) GPS bom em Leiria → gps", () => {
    const fix = gpsFix();
    expect(open(fix, HOME, LAST)).toEqual({ point: { lat: fix.lat, lon: fix.lon }, source: "gps" });
  });

  it("(b) sem GPS, com Casa → home", () => {
    expect(open(null, HOME, LAST)).toEqual({ point: HOME, source: "home" });
  });

  it("(c) sem GPS, sem Casa, com última posição → last", () => {
    expect(open(null, null, LAST)).toEqual({ point: LAST, source: "last" });
  });

  it("(d) nada → centro de Leiria", () => {
    expect(open(null, null, null)).toEqual({ point: DOMAIN_CONFIG.leiriaCenter, source: "leiria" });
  });

  it("(e) GPS em Lisboa (> 30 km) com Casa → home, não o GPS", () => {
    expect(open(gpsFix({ ...LISBON }), HOME, LAST).source).toBe("home");
  });

  it("(f) GPS impreciso (300 m) com Casa → home", () => {
    expect(open(gpsFix({ accuracyM: 300 }), HOME, LAST).source).toBe("home");
  });

  it("GPS de 11 minutos → cai para Casa", () => {
    expect(open(gpsFix({ atMs: NOW - 660_000 }), HOME, LAST).source).toBe("home");
  });

  it("limites inclusivos: exatamente 10 min e exatamente 100 m ainda valem", () => {
    expect(open(gpsFix({ atMs: NOW - 600_000, accuracyM: 100 }), HOME, LAST).source).toBe("gps");
  });

  it("um milissegundo além de 10 min, ou 100,1 m, não vale", () => {
    expect(open(gpsFix({ atMs: NOW - 600_001 }), HOME, LAST).source).toBe("home");
    expect(open(gpsFix({ accuracyM: 100.1 }), HOME, LAST).source).toBe("home");
  });

  it("precisão null não vale", () => {
    expect(open(gpsFix({ accuracyM: null }), HOME, LAST).source).toBe("home");
  });

  it("idade negativa (relógio estranho) não vale; idade 0 vale", () => {
    expect(open(gpsFix({ atMs: NOW + 1 }), HOME, LAST).source).toBe("home");
    expect(open(gpsFix({ atMs: NOW }), HOME, LAST).source).toBe("gps");
  });

  it("home com lat NaN cai para last", () => {
    expect(open(null, { lat: NaN, lon: -8.79 }, LAST)).toEqual({ point: LAST, source: "last" });
  });

  it("pontos fora da faixa ou (0, 0) não valem e caem para o próximo", () => {
    expect(open(null, { lat: 91, lon: 0 }, LAST).source).toBe("last");
    expect(open(null, { lat: 0, lon: 0 }, null).source).toBe("leiria");
    expect(open(null, null, { lat: 39.7, lon: Infinity }).source).toBe("leiria");
    expect(open(gpsFix({ lat: 0, lon: 0 }), HOME, LAST).source).toBe("home");
  });

  it("GPS em Lisboa sem Casa, com última posição → last", () => {
    expect(open(gpsFix({ ...LISBON }), null, LAST)).toEqual({ point: LAST, source: "last" });
  });

  it("GPS a 29 km de Leiria vale; a 31 km não", () => {
    const c = DOMAIN_CONFIG.leiriaCenter;
    const at = (m: number) => gpsFix({ lat: c.lat + m / 111_194.9, lon: c.lon });
    expect(open(at(29_000), HOME, LAST).source).toBe("gps");
    expect(open(at(31_000), HOME, LAST).source).toBe("home");
  });
});
