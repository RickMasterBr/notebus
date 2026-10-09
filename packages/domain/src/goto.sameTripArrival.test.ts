import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "./config.ts";
import { busCandidates, gotoCards, type BusCandidate, type BusOption, type GotoInput } from "./goto.ts";
import type { PatternData, TripData } from "./passages.ts";
import { P1, TRIPS as ALL_TRIPS, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// B-02 (D-178): a mesma viagem e o mesmo ponto de descida têm uma chegada só. Rede inventada (D-091); cada valor
// esperado tem a conta ao lado. Sem registros de passagem, o horário esperado é o da tabela.

const WED = "2026-10-07";
const walkNone = { min: 0, max: null };
const T0810 = tripId(P1, "weekday", hm(8, 10));
const T0840 = tripId(P1, "weekday", hm(8, 40));
const TRIPS_0810 = ALL_TRIPS.filter((t) => t.id === T0810);
const TRIPS_L1 = ALL_TRIPS.filter((t) => t.id === T0810 || t.id === T0840);

function input(over: Partial<GotoInput> & Pick<GotoInput, "busOptions">): GotoInput {
  return {
    walk: null,
    trips: TRIPS_0810,
    records: [],
    now: at(WED, 7, 0),
    serviceDate: WED,
    dayType: "weekday",
    validFrom: () => VALID_FROM,
    ...over,
  };
}

const bus = (cards: ReturnType<typeof gotoCards>): BusCandidate[] => cards.filter((c): c is BusCandidate => c.kind === "bus");
const byOption = (cards: BusCandidate[], optionId: string) => cards.filter((c) => c.optionId === optionId);

/** L1: embarque na pos. 1 (08:10) e na pos. 6 (08:20), os dois descem na pos. 10 (08:30). */
const FAR: BusOption = { id: "far", pattern: P1, boardPosition: 1, alightPosition: 10, walkToBoard: walkNone, walkAfterAlight: { min: 5, max: null }, rideMinutes: [24, 26] };
const NEAR: BusOption = { id: "near", pattern: P1, boardPosition: 6, alightPosition: 10, walkToBoard: walkNone, walkAfterAlight: { min: 5, max: null }, rideMinutes: [14] };

describe("B-02: mesma viagem e mesma descida, uma chegada só", () => {
  it("duas opções da L1 das 08:10 (embarque 1 e 6, descida 10) mostram o mesmo chega e o mesmo até", () => {
    const cards = bus(gotoCards(input({ busOptions: [FAR, NEAR] })));
    expect(cards.map((c) => c.optionId).sort()).toEqual(["far", "near"]);
    const [a, b] = cards;
    expect(a!.arriveAt).toBe(b!.arriveAt);
    expect(a!.until).toBe(b!.until);
  });

  it("o valor é o da opção que embarca mais perto da descida (a posição 6), cada uma com o seu sair às", () => {
    const cards = bus(gotoCards(input({ busOptions: [FAR, NEAR] })));
    const [alone] = busCandidates(NEAR, input({ busOptions: [NEAR] }));
    // Sozinha, a posição 6: embarque 08:20, trecho (1·14 + 3·10)/4 = 11 → 08:31; +5 a pé = 08:36. Sem a regra, a pos. 1
    // dava 08:10 + (2·25 + 3·20)/5 = 22 → 08:32 + 5 = 08:37.
    expect(byOption(cards, "near")[0]!.arriveAt).toBe(alone!.arriveAt);
    expect(byOption(cards, "far")[0]!.arriveAt).toBe(alone!.arriveAt);
    expect(byOption(cards, "far")[0]!.until).toBe(alone!.until);
    expect(byOption(cards, "far")[0]!.usedRideTimes).toBe(alone!.usedRideTimes);
    // O sair às e o esteja no ponto seguem cada opção: a pos. 1 sai 10 min antes da pos. 6.
    expect(byOption(cards, "near")[0]!.leaveAt - byOption(cards, "far")[0]!.leaveAt).toBe(10);
  });

  it("o tempo a pé depois da descida continua por opção", () => {
    const far = { ...FAR, walkAfterAlight: { min: 9, max: null } };
    const cards = bus(gotoCards(input({ busOptions: [far, NEAR] })));
    // Centro de referência 08:31 (sem a pé): a pos. 6 chega 08:36, a pos. 1 com 9 min a pé chega 08:40.
    expect(byOption(cards, "near")[0]!.arriveAt - byOption(cards, "far")[0]!.arriveAt).toBe(-4);
    const [alone] = busCandidates(NEAR, input({ busOptions: [NEAR] }));
    expect(byOption(cards, "near")[0]!.arriveAt).toBe(alone!.arriveAt);
  });

  it("circular: mesma descida (posição) agrupa; mesmo stopId em outra posição não", () => {
    // Percurso de 8 posições que passa 3 vezes no ponto c-a (pos. 1, 4 e 8), um horário a cada 5 min a partir das 08:00.
    const pattern: PatternData = {
      id: "circ",
      stops: ["c-a", "c-b", "c-c", "c-a", "c-d", "c-e", "c-f", "c-a"].map((stopId, i) => ({ position: i + 1, stopId, isTimepoint: true })),
    };
    const trip: TripData = {
      id: "circ-trip",
      patternId: "circ",
      firstPosition: 1,
      lastPosition: 8,
      stopTimes: pattern.stops.map((s) => ({ position: s.position, serviceMinute: hm(8, 0) + 5 * (s.position - 1), origin: "official" as const })),
    };
    const opt = (id: string, boardPosition: number, alightPosition: number, ride: number): BusOption => ({
      id, pattern, boardPosition, alightPosition, walkToBoard: walkNone, walkAfterAlight: walkNone, rideMinutes: [ride, ride, ride],
    });
    // Com n = 3 e k = 3, o trecho é a média entre o medido e o oficial.
    const o1 = opt("o1", 1, 4, 11); // oficial 15 → 13; embarque 08:00 → 08:13
    const o2 = opt("o2", 2, 4, 8); // oficial 10 → 9; embarque 08:05 → 08:14
    const o3 = opt("o3", 1, 8, 31); // oficial 35 → 33; 08:33 (desce na pos. 8, mesmo stopId das pos. 1 e 4)
    const o4 = opt("o4", 5, 8, 9); // oficial 15 → 12; embarque 08:20 → 08:32
    const cards = bus(gotoCards(input({ busOptions: [o1, o2, o3, o4], trips: [trip] })));
    const arrive = (id: string) => byOption(cards, id)[0]!.arriveAt;
    expect([arrive("o1"), arrive("o2")]).toEqual([hm(8, 14), hm(8, 14)]); // grupo da pos. 4: vale a o2 (embarque 2)
    expect([arrive("o3"), arrive("o4")]).toEqual([hm(8, 32), hm(8, 32)]); // grupo da pos. 8: vale a o4 (embarque 5)
  });

  it("sem mudança: uma opção por viagem e opções em viagens diferentes dão o de hoje", () => {
    const solo = input({ busOptions: [FAR], trips: TRIPS_L1 });
    expect(bus(gotoCards(solo))).toEqual(busCandidates(FAR, solo));

    const patA: PatternData = { id: "pa", stops: [{ position: 1, stopId: "a1", isTimepoint: true }, { position: 2, stopId: "a2", isTimepoint: true }] };
    const patB: PatternData = { id: "pb", stops: [{ position: 1, stopId: "b1", isTimepoint: true }, { position: 2, stopId: "b2", isTimepoint: true }] };
    const mk = (pattern: PatternData, start: number, ride: readonly number[]) => {
      const trip: TripData = {
        id: `trip-${pattern.id}`, patternId: pattern.id, firstPosition: 1, lastPosition: 2,
        stopTimes: [{ position: 1, serviceMinute: start, origin: "official" }, { position: 2, serviceMinute: start + 20, origin: "official" }],
      };
      const option: BusOption = { id: pattern.id, pattern, boardPosition: 1, alightPosition: 2, walkToBoard: walkNone, walkAfterAlight: walkNone, rideMinutes: ride };
      return { trip, option };
    };
    const a = mk(patA, hm(8, 10), [26]);
    const b = mk(patB, hm(8, 10), []);
    const two = input({ busOptions: [a.option, b.option], trips: [a.trip, b.trip] });
    const expected = [...busCandidates(a.option, two), ...busCandidates(b.option, two)].sort((x, y) => x.arriveAt - y.arriveAt || y.leaveAt - x.leaveAt);
    expect(bus(gotoCards(two))).toEqual(expected);
  });

  it("ordenação, corte e cartão a pé seguem as regras depois de harmonizar", () => {
    const base = input({ busOptions: [FAR, NEAR], trips: TRIPS_L1 });
    const buses = bus(gotoCards(base));
    // 4 candidatos: duas viagens × duas opções. Em cada viagem os dois chegam juntos; empate → sai mais tarde primeiro (a pos. 6).
    expect(buses.map((c) => [c.tripId, c.optionId])).toEqual([[T0810, "near"], [T0810, "far"], [T0840, "near"], [T0840, "far"]]);
    expect(buses.map((c) => c.arriveAt)).toEqual([...buses.map((c) => c.arriveAt)].sort((x, y) => x - y));

    // A pé chega 07:00 + 100 = 08:40: vence as da 08:40 (chegam ~09:06, 26 min depois) e não as da 08:10 (~08:36).
    const withWalk = gotoCards({ ...base, walk: { id: "a-pe", walkMinutes: 100 } });
    expect(withWalk.map((c) => c.optionId)).toEqual(["near", "far", "a-pe", "near", "far"]);

    // maxCards 3: corta ônibus do fim, o a pé sobrevive.
    const cut = gotoCards({ ...base, walk: { id: "a-pe", walkMinutes: 100 }, config: { ...DOMAIN_CONFIG, maxCards: 3 } });
    expect(cut.map((c) => c.optionId)).toEqual(["near", "far", "a-pe"]);
  });
});
