import { describe, expect, it } from "vitest";
import { distanceM, type PositionFix } from "./geo.ts";
import { suggestStopLocation, validateLocation, type StopLocationRecord } from "./stopLocation.ts";

// T-69 e T-70. Coordenadas INVENTADAS (D-091). Deslocamentos em metros ao norte de BASE (1° de latitude ≈ 111.194,9 m).
const BASE = { lat: 39.74, lon: -8.8 };
const north = (m: number) => ({ lat: BASE.lat + m / 111_194.9, lon: BASE.lon });
const fixAt = (m: number, accuracyM: number | null = 10): PositionFix => ({ ...north(m), accuracyM, atMs: 0 });
const rec = (id: string, order: number, m: number, over: Partial<StopLocationRecord> = {}): StopLocationRecord => ({
  id,
  mode: "live",
  gps: fixAt(m),
  recordedAt: order * 1000,
  ...over,
});

describe("T-69: sugerir guardar a localização do ponto", () => {
  it("(a) 3 registros ao vivo, precisão ≤ 30 m, todos a ≤ 40 m da mediana → oferece, com a mediana", () => {
    const r = suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 10), rec("r3", 3, 20)], false, null);
    expect(r?.recordIds.sort()).toEqual(["r1", "r2", "r3"]);
    expect(distanceM(r!.point, north(10))).toBeLessThan(0.01);
  });

  it("(b) 2 registros → nada", () => {
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 5)], false, null)).toBeNull();
  });

  it("(c) 3 registros, um a 90 m → nada", () => {
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 2), rec("r3", 3, 90)], false, null)).toBeNull();
  });

  it("(d) 3 registros, um 'ajustado' (later) → nada (sobram 2); memory também não conta", () => {
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { mode: "later" })], false, null)).toBeNull();
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { mode: "memory" })], false, null)).toBeNull();
  });

  it("(e) ponto que já tem localização → nada", () => {
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2)], true, null)).toBeNull();
  });

  it("(f) 'Agora não' → some até o registro seguinte naquele ponto, e volta com um posterior", () => {
    const three = [rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2)];
    expect(suggestStopLocation(three, false, "r3")).toBeNull();
    expect(suggestStopLocation(three, false, "r2")?.recordIds).toContain("r3");
    expect(suggestStopLocation([...three, rec("r4", 4, 3)], false, "r3")?.recordIds.sort()).toEqual(["r2", "r3", "r4"]);
    // id que não existe na lista: a dispensa é ignorada
    expect(suggestStopLocation(three, false, "sumiu")).not.toBeNull();
  });

  it("registro sem GPS, com precisão null ou pior que 30 m não conta", () => {
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { gps: null })], false, null)).toBeNull();
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { gps: fixAt(2, null) })], false, null)).toBeNull();
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { gps: fixAt(2, 31) })], false, null)).toBeNull();
    expect(suggestStopLocation([rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2, { gps: fixAt(2, 30) })], false, null)).not.toBeNull();
  });

  it("os 3 mais recentes concordam mas o 4º, mais antigo, está longe → oferece só com os 3", () => {
    const r = suggestStopLocation([rec("old", 0, 500), rec("r1", 1, 0), rec("r2", 2, 1), rec("r3", 3, 2)], false, null);
    expect(r?.recordIds.sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("o mais recente longe dos outros dois → nada, mesmo com mais antigos que concordariam", () => {
    expect(suggestStopLocation([rec("a", 1, 0), rec("b", 2, 1), rec("c", 3, 2), rec("d", 4, 200)], false, null)).toBeNull();
  });
});

describe("T-70: conferir a coordenada antes de gravar", () => {
  const leiria = { lat: 39.74, lon: -8.8 };

  it("coordenada normal em Leiria → ok", () => {
    expect(validateLocation(leiria, 10, "manual")).toEqual({ ok: true });
    expect(validateLocation(leiria, null, "suggested")).toEqual({ ok: true });
  });

  it("latitude 95, longitude 181, NaN e infinito → out_of_range", () => {
    for (const p of [{ lat: 95, lon: -8 }, { lat: -90.1, lon: 0 }, { lat: 39, lon: 181 }, { lat: NaN, lon: 1 }, { lat: 1, lon: Infinity }]) {
      expect(validateLocation(p, 10, "manual")).toEqual({ ok: false, reason: "out_of_range" });
    }
    expect(validateLocation({ lat: 90, lon: 180 }, 10, "suggested")).toMatchObject({ ok: true });
  });

  it("(0, 0) → zero_point", () => {
    expect(validateLocation({ lat: 0, lon: 0 }, 5, "manual")).toEqual({ ok: false, reason: "zero_point" });
  });

  it("ponto a 200 km de Leiria → ok com farFromLeiria (o app pergunta)", () => {
    expect(validateLocation({ lat: 41.5, lon: -8.8 }, 10, "manual")).toEqual({ ok: true, farFromLeiria: true });
  });

  it("'usar minha localização agora' com precisão de 80 m → imprecise; null também; 50 m passa", () => {
    expect(validateLocation(leiria, 80, "manual")).toEqual({ ok: false, reason: "imprecise" });
    expect(validateLocation(leiria, null, "manual")).toEqual({ ok: false, reason: "imprecise" });
    expect(validateLocation(leiria, 50, "manual")).toEqual({ ok: true });
  });

  it("na sugestão a precisão não é conferida de novo (já filtrada)", () => {
    expect(validateLocation(leiria, 80, "suggested")).toEqual({ ok: true });
  });
});
