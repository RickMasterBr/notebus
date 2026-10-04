import { describe, expect, it } from "vitest";
import { checkRide } from "./invariants.ts";
import { alightRide, boardWithOpenRides, dismissRide, expireRide, expireRideWithoutTrip, notBoarded, openRide, rideExpired } from "./ride.ts";
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

  it("fim do percurso + 30 min (Q-82): fecha sozinho sem descida", () => {
    // Fim da viagem das 08:10 = pos. 10 às 08:30; + 30 = 09:00. Às 09:00 ainda não (é preciso passar); às 09:01 fecha.
    const t = trip(T0810);
    expect(rideExpired(t, WED, at(WED, 8, 46))).toBe(false); // com +15 já fecharia
    expect(rideExpired(t, WED, at(WED, 9, 0))).toBe(false);
    expect(rideExpired(t, WED, at(WED, 9, 1))).toBe(true);
    expect(expireRide(open(), t, WED, at(WED, 9, 0)).status).toBe("open");
    expect(expireRide(open(), t, WED, at(WED, 9, 1))).toEqual({ ...open(), status: "closed" });
    // Viagem das 24:10 de quarta (fim 24:30, + 30 = 25:00): quinta 00:59 ainda não; 01:01 sim (D-016).
    const late = trip(tripId(P1, "weekday", hm(24, 10)));
    expect([rideExpired(late, WED, at("2026-10-08", 0, 59)), rideExpired(late, WED, at("2026-10-08", 1, 1))]).toEqual([false, true]);
  });

  it("Q-85: ride sem viagem conhecida fecha 3 h depois do embarque", () => {
    // Embarque 08:12 → 11:12 ainda aberto (3 h exatas); 11:13 fecha.
    const noTrip = openRide("ride-x", "obs-x", null);
    const boardedAt = at(WED, 8, 12);
    expect(expireRideWithoutTrip(noTrip, boardedAt, at(WED, 11, 12)).status).toBe("open");
    expect(expireRideWithoutTrip(noTrip, boardedAt, at(WED, 11, 13))).toEqual({ ...noTrip, status: "closed" });
    expect(expireRideWithoutTrip({ ...noTrip, status: "dismissed" }, boardedAt, at(WED, 12, 0)).status).toBe("dismissed");
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
