/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 1 = 490, 2 = 492 (Arrabalde), 3 ≈ 502,67, 4 ≈ 513,33, 5 = 524 (Campus, controle),
// 6 = 534,5, 7 = 545 (Estação, fim). Embarque às 08:12:30 na Arrabalde: atraso +0,5.
import { describe, expect, it } from "vitest";
import { matchNetworkOf } from "./records";
import { buildAlightRows, buildTripCard } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";
import { buildAlightList } from "./alightList";

const boarding = (stop: "A" | "S", line: string, hhmm: string, ss = "00") => ({
  stopId: stopId(stop),
  lineId: lineId(line),
  observedAt: lisbon(THURSDAY, hhmm, ss),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

describe("buildAlightList: lista de paragens na ordem do percurso", () => {
  it("a ordem de rows é [3, 4, 5, 6, 7] abrindo às 08:13, 08:30, 08:46 e 08:59 (não reordena)", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const times = ["08:13", "08:30", "08:46", "08:59"];
    for (const time of times) {
      const list = buildAlightList(card, data, lisbon(THURSDAY, time));
      expect(list.rows.map((r) => r.position)).toEqual([3, 4, 5, 6, 7]);
    }
  });

  it("highlightedPosition sem escolha: 08:30 → 4, 08:46 → 5, 08:59 → 6, igual à 1ª linha de buildAlightRows", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const checks = [
      { time: "08:30", expected: 4 },
      { time: "08:46", expected: 5 },
      { time: "08:59", expected: 6 },
    ];

    for (const { time, expected } of checks) {
      const instant = lisbon(THURSDAY, time);
      const list = buildAlightList(card, data, instant);
      const rawRows = buildAlightRows(card, data, instant);
      expect(list.highlightedPosition).toBe(expected);
      expect(list.highlightedPosition).toBe(rawRows[0]?.position);
    }
  });

  it("com chosenPosition 7 aberto às 08:46 → destaque 7; com chosenPosition 99 (fora da lista) → cai na mais provável (5)", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    const instant = lisbon(THURSDAY, "08:46");

    const listChosen7 = buildAlightList(card, data, instant, 7);
    expect(listChosen7.highlightedPosition).toBe(7);

    const listChosen99 = buildAlightList(card, data, instant, 99);
    expect(listChosen99.highlightedPosition).toBe(5);
  });

  it("cartão sem viagem conhecida (trip: null): lista vazia e destaque null", async () => {
    const { data } = await fixture();
    const cardNoTrip = buildTripCard("r", boarding("S", "2", "08:12"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(cardNoTrip.trip).toBeNull();

    const listWithoutChosen = buildAlightList(cardNoTrip, data, lisbon(THURSDAY, "08:13"));
    expect(listWithoutChosen).toEqual({ rows: [], highlightedPosition: null });

    const listWithChosen = buildAlightList(cardNoTrip, data, lisbon(THURSDAY, "08:13"), 5);
    expect(listWithChosen).toEqual({ rows: [], highlightedPosition: null });
  });
});
