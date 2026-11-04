import { describe, expect, it } from "vitest";
import { busCandidates, gotoCards, type BusOption, type GotoInput } from "./goto.ts";
import { formatServiceMinute } from "./serviceMinute.ts";
import { P1, TRIPS as ALL_TRIPS, VALID_FROM, at } from "./testing/e03Network.ts";

// O cartão de ônibus fica até a hora do ônibus passar, mesmo com `sair às` já passado (rede inventada, D-091).
// Casa → Faculdade pela L1 (sem registros): a viagem das 08:10 tem esteja às 08:06 e sair às 07:58 (8 min a pé).

const WED = "2026-10-07";
const TRIPS = ALL_TRIPS.filter((t) => t.id.includes("/weekday/"));
const OPTION: BusOption = {
  id: "casa-facul-l1",
  pattern: P1,
  boardPosition: 2,
  alightPosition: 10,
  walkToBoard: { min: 8, max: null },
  walkAfterAlight: { min: 5, max: null },
  rideMinutes: [],
};
const input = (h: number, m: number): GotoInput => ({
  busOptions: [OPTION],
  walk: null,
  trips: TRIPS,
  records: [],
  now: at(WED, h, m),
  serviceDate: WED,
  dayType: "weekday",
  validFrom: () => VALID_FROM,
});
const t0810 = (h: number, m: number) => busCandidates(OPTION, input(h, m)).find((c) => formatServiceMinute(c.beAtStop) === "08:06");

describe("ônibus fica até passar", () => {
  it("C1: às 08:00 (sair às 07:58 já passou) a viagem continua; às 08:12 ainda; às 08:13 sai (revisto pela ideia 231)", () => {
    expect(formatServiceMinute(t0810(8, 0)!.leaveAt)).toBe("07:58");
    expect(t0810(8, 11)).toBeDefined();
    expect(t0810(8, 12)).toBeDefined();
    expect(t0810(8, 13)).toBeUndefined();
  });

  it("C2: entre esteja às e a hora do ônibus o cartão fica, com leaveAtPassed verdadeiro", () => {
    const c = t0810(8, 7)!;
    expect(formatServiceMinute(c.beAtStop)).toBe("08:06");
    expect(formatServiceMinute(c.leaveAt)).toBe("07:58");
    expect(c.leaveAtPassed).toBe(true);
  });

  it("C3: gotoCards mantém a viagem às 08:12 e a descarta às 08:13", () => {
    const has = (h: number, m: number) => gotoCards(input(h, m)).some((c) => c.kind === "bus" && formatServiceMinute(c.beAtStop) === "08:06");
    expect(has(8, 12)).toBe(true);
    expect(has(8, 13)).toBe(false);
  });

  it("C1: gotoCards também mantém a viagem", () => {
    const cards = gotoCards(input(8, 0));
    expect(cards.some((c) => c.kind === "bus" && formatServiceMinute(c.beAtStop) === "08:06")).toBe(true);
  });

  it("C2: leaveAtPassed é falso antes, falso no minuto igual e verdadeiro depois de sair às", () => {
    expect(t0810(7, 57)!.leaveAtPassed).toBe(false);
    expect(t0810(7, 58)!.leaveAtPassed).toBe(false);
    expect(t0810(7, 59)!.leaveAtPassed).toBe(true);
    expect(t0810(8, 6)!.leaveAtPassed).toBe(true);
  });

  it("C2: a ordem segue por chega ~ (a viagem que já devia ter saído continua primeira)", () => {
    const cards = gotoCards(input(8, 0));
    const arrivals = cards.map((c) => c.arriveAt);
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    expect(formatServiceMinute(cards[0]!.leaveAt)).toBe("07:58");
  });
});
