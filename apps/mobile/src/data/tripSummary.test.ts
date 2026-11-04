/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 1 = 490, 2 = 492 (Arrabalde), 3 ≈ 502,67, 4 ≈ 513,33, 5 = 524 (Campus, controle),
// 6 = 534,5, 7 = 545 (Estação, fim). Embarque às 08:12:30 na Arrabalde: atraso +0,5.
import { describe, expect, it } from "vitest";
import { matchNetworkOf } from "./records";
import { buildAlightRows, buildTripCard } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";
import { tripSummary } from "./tripSummary";

const boarding = (stop: "A" | "S", line: string, hhmm: string, ss = "00") => ({
  stopId: stopId(stop),
  lineId: lineId(line),
  observedAt: lisbon(THURSDAY, hhmm, ss),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

describe("tripSummary: resumo da viagem em andamento", () => {
  it("sem escolha: 08:20 → next pos. 3; 08:46 → next pos. 6; 09:30 → next pos. 7 (a última)", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const summary0820 = tripSummary(card, data, null, lisbon(THURSDAY, "08:20"));
    expect(summary0820).toMatchObject({
      kind: "next",
      row: { position: 3, name: "Estádio Fictício" },
    });

    const summary0846 = tripSummary(card, data, null, lisbon(THURSDAY, "08:46"));
    expect(summary0846).toMatchObject({
      kind: "next",
      row: { position: 6, name: "Estádio Fictício" },
    });

    const summary0930 = tripSummary(card, data, null, lisbon(THURSDAY, "09:30"));
    expect(summary0930).toMatchObject({
      kind: "next",
      row: { position: 7, name: "Estação Inventada" },
    });
  });

  it("com chosenPosition 5 em qualquer instante: chosen com row.time igual a buildAlightRows da posição (~08:45)", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const times = ["08:20", "08:46", "09:30"];
    for (const time of times) {
      const instant = lisbon(THURSDAY, time);
      const summary = tripSummary(card, data, 5, instant);
      const row5 = buildAlightRows(card, data, instant).find((r) => r.position === 5)!;

      expect(summary).toEqual({
        kind: "chosen",
        row: row5,
      });
      expect(summary?.kind === "chosen" && summary.row.time).toBe("08:45");
      expect(summary?.kind === "chosen" && summary.row.name).toBe("Campus Exemplo");
    }
  });

  it("com chosenPosition fora da lista (ex: 99): recai em kind next", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const summary = tripSummary(card, data, 99, lisbon(THURSDAY, "08:46"));
    expect(summary).toMatchObject({
      kind: "next",
      row: { position: 6 },
    });
  });

  it("cartão sem viagem conhecida (trip: null): tripSummary devolve null", async () => {
    const { data } = await fixture();
    const cardNoTrip = buildTripCard("r", boarding("S", "2", "08:12"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(cardNoTrip.trip).toBeNull();

    expect(tripSummary(cardNoTrip, data, null, lisbon(THURSDAY, "08:13"))).toBeNull();
    expect(tripSummary(cardNoTrip, data, 5, lisbon(THURSDAY, "08:13"))).toBeNull();
  });

  it("fronteiras de comparação (A36): instante antes do minuto da pos. 5, no próprio minuto e depois", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    // Pos. 5 minute = 524.5.
    // 08:43 (523) -> antes: next é pos. 5 (524.5 >= 523)
    const before5 = tripSummary(card, data, null, lisbon(THURSDAY, "08:43"));
    expect(before5).toMatchObject({ kind: "next", row: { position: 5 } });

    // 08:44 (524) -> minuto da tabela: next é pos. 5 (524.5 >= 524)
    const at5 = tripSummary(card, data, null, lisbon(THURSDAY, "08:44"));
    expect(at5).toMatchObject({ kind: "next", row: { position: 5 } });

    // 08:45 (525) -> depois: pos. 5 já passou (524.5 < 525), next é pos. 6 (535 >= 525)
    const after5 = tripSummary(card, data, null, lisbon(THURSDAY, "08:45"));
    expect(after5).toMatchObject({ kind: "next", row: { position: 6 } });
  });

  it("fronteira exata minute == currentMinute (pos. 6 a 535.0 com >=): 08:54, 08:55 e 08:56", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    // Pos. 6 minute = 535.0 (534.5 + 0.5). 08:55 = minuto 535.
    // 08:54 (534): 535.0 >= 534 → pos. 6
    const at0854 = tripSummary(card, data, null, lisbon(THURSDAY, "08:54"));
    expect(at0854).toMatchObject({ kind: "next", row: { position: 6 } });

    // 08:55 (535): 535.0 >= 535 → pos. 6 (se fosse >, 535.0 > 535 seria falso e pularia para a pos. 7)
    const at0855 = tripSummary(card, data, null, lisbon(THURSDAY, "08:55"));
    expect(at0855).toMatchObject({ kind: "next", row: { position: 6 } });

    // 08:56 (536): 535.0 < 536 → pos. 7 (545.5 >= 536)
    const at0856 = tripSummary(card, data, null, lisbon(THURSDAY, "08:56"));
    expect(at0856).toMatchObject({ kind: "next", row: { position: 7 } });
  });

  it("quando serviceMinuteOn devolve null: devolve a primeira linha da lista", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    // 2 dias depois: serviceMinuteOn devolve null
    const distant = tripSummary(card, data, null, lisbon("2026-10-10", "08:00"));
    expect(distant).toMatchObject({ kind: "next", row: { position: 3 } });
  });
});
