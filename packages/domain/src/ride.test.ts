import { describe, expect, it } from "vitest";
import { checkRide } from "./invariants.ts";
import { alightRide, boardWithOpenRides, dismissRide, expireRide, notBoarded, openRide, rideExpired } from "./ride.ts";
import { P1, at, hm, trip, tripId } from "./testing/e03Network.ts";

// Ciclo do `ride` (E-03 §4) sobre a rede inventada (D-091). A viagem das 08:10 da L1 termina na pos. 10 às 08:30.

const WED = "2026-10-07";
const T0810 = tripId(P1, "weekday", hm(8, 10));
const open = () => openRide("ride-1", "obs-board", T0810);
const board = { patternId: P1.id, position: 2, observedAt: at(WED, 8, 12) };

describe("ciclo do ride (E-03 §4)", () => {
  it("Desci aqui: open → closed, com a descida ligada", () => {
    const r = alightRide(open(), "obs-alight", board, { patternId: P1.id, position: 6, observedAt: at(WED, 8, 21) });
    expect(r).toEqual({ id: "ride-1", boardingObservationId: "obs-board", alightingObservationId: "obs-alight", tripId: T0810, status: "closed" });
  });

  it("Não embarquei (D-073): open → dismissed, e o embarque passa a \"vi passar\"", () => {
    const { ride, boardingKind } = notBoarded(open());
    expect([ride.status, ride.alightingObservationId, boardingKind]).toEqual(["dismissed", null, "passed"]);
  });

  it("Dispensar: open → closed sem descida", () => {
    expect(dismissRide(open())).toEqual({ ...open(), status: "closed" });
  });

  it("fim do percurso + 15 min: fecha sozinho sem descida", () => {
    // Fim da viagem das 08:10 = pos. 10 às 08:30; + 15 = 08:45. Às 08:45 ainda não (é preciso passar); às 08:46 fecha.
    const t = trip(T0810);
    expect(rideExpired(t, WED, at(WED, 8, 45))).toBe(false);
    expect(rideExpired(t, WED, at(WED, 8, 46))).toBe(true);
    expect(expireRide(open(), t, WED, at(WED, 8, 45)).status).toBe("open");
    expect(expireRide(open(), t, WED, at(WED, 8, 46))).toEqual({ ...open(), status: "closed" });
    // Viagem das 24:10 de quarta (fim 24:30, + 15 = 24:45): quinta 00:40 ainda não; 00:46 sim (D-016).
    const late = trip(tripId(P1, "weekday", hm(24, 10)));
    expect([rideExpired(late, WED, at("2026-10-08", 0, 40)), rideExpired(late, WED, at("2026-10-08", 0, 46))]).toEqual([false, true]);
  });

  it("T-26: ride aberto e novo embarque → o anterior fecha sem descida", () => {
    const next = openRide("ride-2", "obs-board-2", null);
    const { closed, opened } = boardWithOpenRides([open()], next);
    expect(closed).toEqual([{ ...open(), status: "closed", alightingObservationId: null }]);
    expect(opened).toEqual(next);
  });

  it("transição só a partir de open", () => {
    expect(() => dismissRide(dismissRide(open()))).toThrow(/só com o ride aberto/);
    expect(() => notBoarded({ ...open(), status: "dismissed" })).toThrow(/só com o ride aberto/);
  });
});

describe("invariante 5 (Fase 1 §3)", () => {
  it("descida em posição maior, hora maior ou igual, mesmo percurso", () => {
    expect(checkRide(board, { patternId: P1.id, position: 6, observedAt: at(WED, 8, 12) })).toBeNull(); // mesma hora vale
    expect(checkRide(board, { patternId: P1.id, position: 2, observedAt: at(WED, 8, 20) })).toMatch(/não vem depois/);
    expect(checkRide(board, { patternId: P1.id, position: 6, observedAt: at(WED, 8, 11) })).toMatch(/antes do embarque/);
    expect(checkRide(board, { patternId: "outro", position: 6, observedAt: at(WED, 8, 20) })).toMatch(/percursos diferentes/);
    expect(() => alightRide(open(), "x", board, { patternId: P1.id, position: 1, observedAt: at(WED, 8, 20) })).toThrow(/invariante 5/);
  });
});
