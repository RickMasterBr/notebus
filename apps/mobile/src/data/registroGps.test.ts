import { describe, expect, it } from "vitest";
import { routineRank } from "./boardSuggestion";
import { RECORD_FIX_MAX_AGE_MS, fixForRecord, gpsColumns } from "./recordFix";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";

const AT = lisbon(THURSDAY, "08:12", "30");
const goodFix = { lat: 39.7441, lon: -8.8072, accuracyM: 12.5, atMs: AT - 60_000 };

/** O que o chamador faz: confere a idade com o relógio real e entrega o valor já em memória. */
async function boardWith(fix: typeof goodFix | null, nowReal: number) {
  const { registro } = await fixture();
  const token = await registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: AT, gps: fixForRecord(fix, nowReal) });
  const { observations } = await registro.load();
  return observations.find((o) => o.id === token.observationId)!;
}

describe("posição no registro (E-07 §3.3)", () => {
  it("registro ao vivo com posição boa grava as três colunas", async () => {
    const row = await boardWith(goodFix, AT);
    expect([row.gpsLat, row.gpsLon, row.gpsAccuracyM]).toEqual([39.7441, -8.8072, 12.5]);
  });

  it("posição de 11 min não grava; a de 10 min grava", async () => {
    const old = { ...goodFix, atMs: AT - 11 * 60_000 };
    const row = await boardWith(old, AT);
    expect([row.gpsLat, row.gpsLon, row.gpsAccuracyM]).toEqual([null, null, null]);
    expect(fixForRecord({ ...goodFix, atMs: AT - RECORD_FIX_MAX_AGE_MS }, AT)).not.toBeNull();
    expect(fixForRecord({ ...goodFix, atMs: AT - RECORD_FIX_MAX_AGE_MS - 1 }, AT)).toBeNull();
  });

  it("sem posição grava sem erro, com as colunas vazias", async () => {
    const row = await boardWith(null, AT);
    expect([row.gpsLat, row.gpsLon, row.gpsAccuracyM]).toEqual([null, null, null]);
    expect(row.mode).toBe("live");
  });

  it("registro ajustado (later) ou de memória nunca grava posição", () => {
    expect(gpsColumns("later", goodFix)).toEqual({ gpsLat: null, gpsLon: null, gpsAccuracyM: null });
    expect(gpsColumns("memory", goodFix)).toEqual({ gpsLat: null, gpsLon: null, gpsAccuracyM: null });
    expect(gpsColumns("live", goodFix)).toEqual({ gpsLat: 39.7441, gpsLon: -8.8072, gpsAccuracyM: 12.5 });
  });

  it("a descida ao vivo também leva a posição", async () => {
    const { registro, data } = await fixture();
    const b = await registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: AT });
    const trip = data.trips.find((t) => t.id === tripIdOf("1", "0810"))!;
    const down = await registro.alight({
      rideId: b.rideId,
      stopId: stopId("K"),
      patternId: trip.patternId,
      position: 5,
      at: lisbon(THURSDAY, "08:45"),
      gps: goodFix,
    });
    expect(down.ok).toBe(true);
    const { observations } = await registro.load();
    const alighted = observations.find((o) => o.kind === "alighted")!;
    expect(alighted.gpsLat).toBe(39.7441);
    expect(observations.find((o) => o.kind === "boarded")!.gpsLat).toBeNull();
  });
});

describe("routineRank", () => {
  it("conta embarques e vi passar do mesmo tipo de dia na janela de ±60 min", async () => {
    const { registro, data } = await fixture();
    await registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:00") });
    await registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:30") });
    await registro.board({ stopId: stopId("E"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:50") });
    await registro.board({ stopId: stopId("K"), lineId: lineId("1"), at: lisbon(THURSDAY, "12:00") }); // fora da janela
    const { observations } = await registro.load();
    const rank = routineRank(observations, lisbon(THURSDAY, "08:20"), data);
    expect(rank.get(stopId("A"))).toBe(2);
    expect(rank.get(stopId("E"))).toBe(1);
    expect(rank.has(stopId("K"))).toBe(false);
  });
});
