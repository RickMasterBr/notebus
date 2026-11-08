/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 3 ≈ 08:23 (interpolada), 4 ≈ 08:34 (interpolada), 5 = 08:45 (Campus, controle),
// 6 ≈ 08:55, 7 = 09:06 (Estação, fim). Embarque às 08:12:30 na Arrabalde: atraso +0,5.
import { describe, expect, it } from "vitest";
import { buildAlightList } from "./alightList";
import { matchNetworkOf } from "./records";
import { buildAlightRows, buildTripCard } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";
import { tripCardHome } from "./tripCardHome";

const boarding = (stop: "A" | "S", line: string, hhmm: string, ss = "00") => ({
  stopId: stopId(stop),
  lineId: lineId(line),
  observedAt: lisbon(THURSDAY, hhmm, ss),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

describe("tripCardHome: o cartão do Início fala a língua da Tela de viagem (D-413)", () => {
  it("com a descida escolhida: a hora à direita (sem '~' num ponto de controle) e sem a próxima paragem", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const home = tripCardHome({ card, data, chosenPosition: 5, now: lisbon(THURSDAY, "08:20") });

    expect(home.etaText).toBe("08:45");
    expect(home.nextLine).toBeNull();
  });

  it("com a descida escolhida numa paragem interpolada: a hora leva '~'", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    const instant = lisbon(THURSDAY, "08:20");
    const row4 = buildAlightRows(card, data, instant).find((r) => r.position === 4)!;

    const home = tripCardHome({ card, data, chosenPosition: 4, now: instant });

    expect(row4.approximate).toBe(true);
    expect(home.etaText).toBe(`~${row4.time}`);
    expect(home.nextLine).toBeNull();
  });

  it("sem a descida escolhida: sem hora à direita e com a linha da próxima paragem", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const home = tripCardHome({ card, data, chosenPosition: null, now: lisbon(THURSDAY, "08:20") });

    expect(home.etaText).toBeNull();
    expect(home.nextLine).toBe("Próxima: Estádio Fictício");
  });

  it("sem viagem conhecida: sem hora, sem próxima e sem linha para o Desci aqui", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("S", "2", "08:12"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(card.trip).toBeNull();

    const home = tripCardHome({ card, data, chosenPosition: null, now: lisbon(THURSDAY, "08:13") });

    expect(home).toEqual({ etaText: null, nextLine: null, alightRow: null });
  });

  it("o alightRow é a linha destacada da lista de descidas em dois instantes", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;

    const checks = [
      { time: "08:46", expected: 5 },
      { time: "08:59", expected: 6 },
    ];
    for (const { time, expected } of checks) {
      const instant = lisbon(THURSDAY, time);
      const list = buildAlightList(card, data, instant, null);
      const home = tripCardHome({ card, data, chosenPosition: null, now: instant });

      expect(home.alightRow).toEqual(list.rows.find((r) => r.position === list.highlightedPosition));
      expect(home.alightRow?.position).toBe(expected);
    }
  });

  it("o alightRow segue a descida escolhida, mesmo fora do instante mais provável", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    const instant = lisbon(THURSDAY, "08:46");
    const list = buildAlightList(card, data, instant, 7);

    const home = tripCardHome({ card, data, chosenPosition: 7, now: instant });

    expect(home.alightRow).toEqual(list.rows.find((r) => r.position === 7));
    expect(home.alightRow?.position).toBe(7);
  });
});
