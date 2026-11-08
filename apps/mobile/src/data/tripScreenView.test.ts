/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 5 = 524 (Campus, controle), 6 = 534,5, 7 = 545 (Estação, fim), com atraso +0,5:
// na lista da Tela de viagem a pos. 5 tem minuto 524,5 e o fim 545,5. Embarque na pos. 2.
import { describe, expect, it } from "vitest";
import { buildAlightList } from "./alightList";
import { matchNetworkOf } from "./records";
import { buildTripCard } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";
import { tripDone, tripHeader } from "./tripScreenView";
import type { TripSummary } from "./tripSummary";

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

describe("tripHeader: cabeçalho da Tela de viagem (D-392)", () => {
  it("com descida escolhida: arrives com os minutos até ela, nunca negativos", async () => {
    const { rows } = await fixtureTrip();
    const row5 = rows.find((r) => r.position === 5)!;
    const summary: TripSummary = { kind: "chosen", row: row5 };

    // Fronteiras da comparação com 0: antes (14,5 → 15), no próprio instante e depois (nunca negativo).
    expect(tripHeader(summary, rows, 5, 510)).toEqual({ kind: "arrives", minutes: 15, remaining: 2 });
    expect(tripHeader(summary, rows, 5, row5.minute)).toEqual({ kind: "arrives", minutes: 0, remaining: 0 });
    expect(tripHeader(summary, rows, 5, row5.minute + 1.5)).toEqual({ kind: "arrives", minutes: 0, remaining: 0 });
    // Sem minuto de agora não há contagem: 0. O arredondamento leva o meio minuto para cima.
    expect(tripHeader(summary, rows, 5, null)).toEqual({ kind: "arrives", minutes: 0, remaining: 3 });
    expect(tripHeader(summary, rows, 5, row5.minute - 0.5)).toEqual({ kind: "arrives", minutes: 1, remaining: 1 });
  });

  it("sem descida escolhida: ongoing com o nome da próxima paragem do resumo", async () => {
    const { rows } = await fixtureTrip();
    const row6 = rows.find((r) => r.position === 6)!;
    const summary: TripSummary = { kind: "next", row: row6 };

    expect(tripHeader(summary, rows, null, 500)).toEqual({ kind: "ongoing", nextStopName: row6.name, remaining: 5 });
    expect(tripHeader(summary, rows, null, row6.minute)).toEqual({ kind: "ongoing", nextStopName: row6.name, remaining: 1 });
    expect(tripHeader(summary, rows, null, null)).toEqual({ kind: "ongoing", nextStopName: row6.name, remaining: 5 });
  });

  it("sem resumo: unknown, com as paragens que faltam até ao alvo", async () => {
    const { rows } = await fixtureTrip();
    expect(tripHeader(null, rows, null, 500)).toEqual({ kind: "unknown", remaining: 5 });
    expect(tripHeader(null, rows, null, null)).toEqual({ kind: "unknown", remaining: 5 });
    expect(tripHeader(null, rows, 5, null)).toEqual({ kind: "unknown", remaining: 3 });
    expect(tripHeader(null, [], null, 500)).toEqual({ kind: "unknown", remaining: 0 });
  });

  it("paragens que faltam: fronteira do minuto (pos. 5 = 524,5) — antes, igual e depois", async () => {
    const { rows } = await fixtureTrip();
    const row5 = rows.find((r) => r.position === 5)!;

    expect(tripHeader(null, rows, null, row5.minute - 0.1)).toEqual({ kind: "unknown", remaining: 3 });
    expect(tripHeader(null, rows, null, row5.minute)).toEqual({ kind: "unknown", remaining: 2 });
    expect(tripHeader(null, rows, null, row5.minute + 0.1)).toEqual({ kind: "unknown", remaining: 2 });
  });

  it("paragens que faltam: fronteira do alvo — o alvo entra na conta", async () => {
    const { rows } = await fixtureTrip();
    expect(tripHeader(null, rows, 4, 500)).toEqual({ kind: "unknown", remaining: 2 });
    expect(tripHeader(null, rows, 5, 500)).toEqual({ kind: "unknown", remaining: 3 });
    expect(tripHeader(null, rows, 6, 500)).toEqual({ kind: "unknown", remaining: 4 });
    expect(tripHeader(null, rows, 2, 500)).toEqual({ kind: "unknown", remaining: 0 });
  });
});

describe("tripDone: fim da viagem, duração e diferença para a tabela (D-392)", () => {
  const row5 = { position: 5, stopId: "s5", name: "Campus", time: "08:44", approximate: false, number: null, minute: 524.5 };
  const input = (alightedMinute: number | null, rideDeviation: number | null = 0.5) => ({
    boardedAt: 0,
    alightedAt: 32 * 60_000,
    alightRow: row5,
    rideDeviation,
    alightedMinute,
  });

  it("duração da viagem em minutos, arredondada", () => {
    expect(tripDone(input(524)).minutes).toBe(32);
    expect(tripDone({ ...input(524), alightedAt: 5 * 60_000 + 40_000 }).minutes).toBe(6);
    expect(tripDone({ ...input(524), alightedAt: 5 * 60_000 + 20_000 }).minutes).toBe(5);
  });

  it("sentido da diferença: late, none e early (a tabela da pos. 5 é 524 = 524,5 − 0,5)", () => {
    expect(tripDone(input(526)).delta).toEqual({ direction: "late", minutes: 2 });
    expect(tripDone(input(524)).delta).toEqual({ direction: "none", minutes: 0 });
    expect(tripDone(input(522)).delta).toEqual({ direction: "early", minutes: 2 });
  });

  it("diferença arredondada: 525,6 → late 2; 524,6 → late 1; 523,4 → early 1", () => {
    expect(tripDone(input(525.6)).delta).toEqual({ direction: "late", minutes: 2 });
    expect(tripDone(input(524.6)).delta).toEqual({ direction: "late", minutes: 1 });
    expect(tripDone(input(523.4)).delta).toEqual({ direction: "early", minutes: 1 });
  });

  it("null na diferença quando a viagem não tem atraso conhecido ou não há minuto de descida", () => {
    expect(tripDone(input(526, null)).delta).toBeNull();
    expect(tripDone(input(null)).delta).toBeNull();
    expect(tripDone(input(null, null)).delta).toBeNull();
  });
});
