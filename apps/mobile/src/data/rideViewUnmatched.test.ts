/// <reference types="node" />
// E-09 bloco 5b, item 3.1: fixa o comportamento atual do "Desci aqui" tarde da noite (Q-88, Q-89). Dados inventados (D-091).
// Rede de `registroFixture.ts`: L1 na Arrabalde passa às 08:12 e às 08:42, só em dias úteis. Quinta 08/10/2026.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchNetworkOf } from "./records";
import { buildTripCard } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId } from "./registroFixture";

const boarding = (hhmm: string) => ({
  stopId: stopId("A"),
  lineId: lineId("1"),
  observedAt: lisbon(THURSDAY, hhmm),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

const cardAt = async (hhmm: string) => {
  const { data } = await fixture();
  return buildTripCard("r", boarding(hhmm), data, matchNetworkOf(data), [], lisbon(THURSDAY, hhmm))!;
};

// Mesma decisão do JSX de `ui/TripCard.tsx` ("Desci aqui" só com viagem e sem `unmatched`).
const offersAlight = (card: { trip: unknown; unmatched: boolean }) => Boolean(card.trip && !card.unmatched);

describe("rideView: quando o cartão fica sem viagem (unmatched) e sem Desci aqui", () => {
  it("22:00 de um dia útil, sem mais saídas: trip nulo, unmatched true e o botão não é oferecido", async () => {
    const card = await cardAt("22:00");
    expect(card.trip).toBeNull();
    expect(card.unmatched).toBe(true);
    expect(card.destination).toBeNull();
    expect(card.ahead).toBeNull();
    expect(offersAlight(card)).toBe(false);
    // Q-89: sem saída hoje, o cartão diz quando é a próxima (outro dia de serviço).
    expect(card.unmatchedNext).toMatch(/^próxima: .+, 08:12$/);
  });

  it("antes da primeira saída: a 30 min ainda casa a viagem mais perto; a 31 min não", async () => {
    // 08:12 = base da primeira saída. 07:42 = −30 → mantém a viagem; 07:41 = −31 → sem viagem.
    const at30 = await cardAt("07:42");
    expect(at30.unmatched).toBe(false);
    expect(offersAlight(at30)).toBe(true);
    const at31 = await cardAt("07:41");
    expect(at31.unmatched).toBe(true);
    expect(offersAlight(at31)).toBe(false);
  });

  it("depois da última saída: a +30 min ainda casa a viagem mais perto; a +31 min não", async () => {
    // 08:42 = base da última saída. 09:12 = +30 → mantém; 09:13 = +31 → sem viagem.
    expect(offersAlight(await cardAt("09:12"))).toBe(true);
    const late = await cardAt("09:13");
    expect(late.unmatched).toBe(true);
    expect(offersAlight(late)).toBe(false);
  });

  it("o JSX do cartão só oferece o botão com viagem e sem unmatched", () => {
    const tripCard = readFileSync(join(__dirname, "..", "ui", "TripCard.tsx"), "utf8").replace(/\s+/g, " ");
    expect(tripCard).toContain("{card.trip && !card.unmatched ? ( <Pressable");
    expect(tripCard).toContain('t("home.trip.alight_button")');
  });
});
