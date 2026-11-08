/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 1 = 490, 2 = 492 (Arrabalde), 3 ≈ 502,67, 4 ≈ 513,33, 5 = 524 (Campus, controle),
// 6 = 534,5, 7 = 545 (Estação, fim). Embarque às 08:12:30 na Arrabalde: atraso +0,5.
// A lista da Tela de viagem tem as posições 3 a 7, com minutos ≈ 503,17, 513,83, 524,5, 535,0 e 545,5.
import { describe, expect, it } from "vitest";
import { buildAlightList } from "./alightList";
import { matchNetworkOf } from "./records";
import { buildTripCard, type AlightRow } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";
import { tripProgress } from "./tripProgress";

const boarding = (stop: "A" | "S", line: string, hhmm: string, ss = "00") => ({
  stopId: stopId(stop),
  lineId: lineId(line),
  observedAt: lisbon(THURSDAY, hhmm, ss),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

async function fixtureTrip() {
  const { data } = await fixture();
  const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
  const rows = buildAlightList(card, data, lisbon(THURSDAY, "08:13")).rows;
  return { card, rows };
}

describe("tripProgress: barra de progresso da viagem (D-392)", () => {
  it("sem descida escolhida: divide entre o embarque (2) e a última paragem (7), com a fronteira da pos. 5", async () => {
    const { rows } = await fixtureTrip();
    expect(rows.map((r) => r.position)).toEqual([3, 4, 5, 6, 7]);
    const row5 = rows.find((r) => r.position === 5)!;
    expect(row5.minute).toBeCloseTo(524.5);

    // minuto um antes, igual e um depois do minuto da pos. 5 (A36)
    expect(tripProgress(rows, 2, null, row5.minute - 1)).toBeCloseTo(0.4); // atual 4: (4-2)/(7-2)
    expect(tripProgress(rows, 2, null, row5.minute)).toBeCloseTo(0.6); // atual 5: (5-2)/(7-2)
    expect(tripProgress(rows, 2, null, row5.minute + 1)).toBeCloseTo(0.6); // continua na 5
  });

  it("com descida escolhida (5): divide pelo alvo e nunca passa de 1", async () => {
    const { rows } = await fixtureTrip();
    const row5 = rows.find((r) => r.position === 5)!;

    expect(tripProgress(rows, 2, 5, row5.minute - 1)).toBeCloseTo(2 / 3); // (4-2)/(5-2)
    expect(tripProgress(rows, 2, 5, row5.minute)).toBe(1); // (5-2)/(5-2)
    expect(tripProgress(rows, 2, 5, row5.minute + 1)).toBe(1);
  });

  it("fronteira do fim do percurso: antes, igual e depois do minuto da última paragem", async () => {
    const { rows } = await fixtureTrip();
    const row7 = rows.find((r) => r.position === 7)!;
    expect(row7.minute).toBeCloseTo(545.5);

    expect(tripProgress(rows, 2, null, row7.minute - 1)).toBeCloseTo(0.8); // atual 6: (6-2)/(7-2)
    expect(tripProgress(rows, 2, null, row7.minute)).toBe(1);
    expect(tripProgress(rows, 2, null, row7.minute + 1)).toBe(1);
  });

  it("antes da primeira paragem ainda está no embarque: 0", async () => {
    const { rows } = await fixtureTrip();
    const row3 = rows.find((r) => r.position === 3)!;
    expect(tripProgress(rows, 2, null, row3.minute - 1)).toBe(0);
  });

  it("null sem linhas, sem minuto de agora ou com o alvo no embarque", async () => {
    const { rows } = await fixtureTrip();
    const onlyBoard: AlightRow[] = [
      { position: 2, stopId: "s2", name: "Arrabalde", time: "08:12", approximate: false, number: null, minute: 492.5 },
    ];
    expect(tripProgress([], 2, null, 500)).toBeNull();
    expect(tripProgress(rows, 2, null, null)).toBeNull();
    expect(tripProgress(rows, 2, 2, 500)).toBeNull();
    // Sem alvo explícito, uma lista só com a paragem do embarque também não tem percurso a dividir.
    expect(tripProgress(onlyBoard, 2, null, 500)).toBeNull();
  });
});
