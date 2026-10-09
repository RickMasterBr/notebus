import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "./config.ts";
import { offlineRegion } from "./offline.ts";

// T-71. Coordenadas INVENTADAS (D-091). Valores esperados contados à mão com a grade padrão de tiles (web mercator).
const LISBON = { lat: 38.72, lon: -9.14 };
const OUTSIDE = { lat: 39.9, lon: -8.6 };

describe("T-71: região offline", () => {
  it("caixa padrão, sem pontos: 2, 4, 12, 42, 120 tiles por zoom → 180 (bate com o S-03)", () => {
    const r = offlineRegion([]);
    expect(r.tileCount).toBe(180);
    expect(r.bounds).toEqual(DOMAIN_CONFIG.offlineBox);
    expect(r.ignoredPoints).toBe(0);
    expect(r.estimatedMb).toBeCloseTo((180 * 51) / 1024, 6);
  });

  it("contagem por zoom da caixa padrão", () => {
    const perZoom = [10, 11, 12, 13, 14].map((z) => offlineRegion([], { ...DOMAIN_CONFIG, offlineMinZoom: z, offlineMaxTileZoom: z }).tileCount);
    expect(perZoom).toEqual([2, 4, 12, 42, 120]);
  });

  it("ponto fora da caixa em 39,90 / −8,60 cresce a região → 4, 9, 25, 81, 272 = 391", () => {
    const r = offlineRegion([OUTSIDE]);
    expect(r.bounds.south).toBe(39.66);
    expect(r.bounds.west).toBe(-8.93);
    expect(r.bounds.north).toBeCloseTo(39.918, 3);
    expect(r.bounds.east).toBeCloseTo(-8.5766, 3);
    const perZoom = [10, 11, 12, 13, 14].map((z) => offlineRegion([OUTSIDE], { ...DOMAIN_CONFIG, offlineMinZoom: z, offlineMaxTileZoom: z }).tileCount);
    expect(perZoom).toEqual([4, 9, 25, 81, 272]);
    expect(r.tileCount).toBe(391);
  });

  it("ponto dentro da caixa (centro de Leiria) não muda nada", () => {
    const r = offlineRegion([DOMAIN_CONFIG.leiriaCenter]);
    expect(r.tileCount).toBe(180);
    expect(r.bounds).toEqual(DOMAIN_CONFIG.offlineBox);
  });

  it("ponto em Lisboa é ignorado e contado", () => {
    const r = offlineRegion([LISBON]);
    expect(r.ignoredPoints).toBe(1);
    expect(r.tileCount).toBe(180);
  });

  it("NaN, infinito, fora da faixa e (0, 0) são ignorados", () => {
    const r = offlineRegion([{ lat: NaN, lon: -8.8 }, { lat: 0, lon: 0 }, { lat: 39.7, lon: Infinity }, { lat: 95, lon: -8.8 }]);
    expect(r.ignoredPoints).toBe(4);
    expect(r.tileCount).toBe(180);
  });

  it("mais pontos nunca diminuem o total, e a ordem não importa", () => {
    const a = { lat: 39.9, lon: -8.6 };
    const b = { lat: 39.5, lon: -9.1 };
    const c = { lat: 39.74, lon: -8.8 };
    const orders = [[a, b, c], [c, b, a], [b, a, c]].map((pts) => offlineRegion(pts));
    expect(orders[1]).toEqual(orders[0]);
    expect(orders[2]).toEqual(orders[0]);
    expect(orders[0]!.tileCount).toBeGreaterThanOrEqual(offlineRegion([a, b]).tileCount);
    expect(offlineRegion([a, b]).tileCount).toBeGreaterThanOrEqual(offlineRegion([a]).tileCount);
    expect(offlineRegion([a]).tileCount).toBeGreaterThan(180);
  });
});
