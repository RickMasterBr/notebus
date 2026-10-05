import { describe, expect, it } from "vitest";
import { fixture, THURSDAY, lisbon, lineId, stopId } from "./registroFixture";
import { buildTripCard, computeUnmatchedNext } from "./rideView";
import { matchNetworkOf } from "./records";

describe("computeUnmatchedNext & TripCard unmatched", () => {
  it("calcula próxima passagem hoje ('próxima às HH:MM') quando há serviço mais tarde", async () => {
    const { data } = await fixture();
    // Quinta-feira 07:00 na Arrabalde para a Linha 1: a primeira viagem sai às 08:10 e passa na Arrabalde às 08:12
    const at = lisbon(THURSDAY, "07:00");
    const next = computeUnmatchedNext(stopId("A"), "1", data, at);
    expect(next).toBe("próxima às 08:12");
  });

  it("calcula próximo dia de serviço ('próxima: <dia>, HH:MM') quando os ônibus de hoje acabaram", async () => {
    const { data } = await fixture();
    // Quinta-feira 23:00 na Arrabalde para a Linha 1 (último de quinta já passou)
    const at = lisbon(THURSDAY, "23:00");
    const next = computeUnmatchedNext(stopId("A"), "1", data, at);
    // Próximo dia com serviço é sexta (2026-10-09), primeiro passa na Arrabalde às 08:12
    expect(next).toBe("próxima: sexta, 08:12");
  });

  it("retorna null quando a linha não passa no ponto ou linha inválida", async () => {
    const { data } = await fixture();
    const at = lisbon(THURSDAY, "08:00");
    expect(computeUnmatchedNext(stopId("S"), "999", data, at)).toBeNull();
  });

  it("buildTripCard preenche unmatchedNext quando unmatched === true", async () => {
    const { data } = await fixture();
    const network = matchNetworkOf(data);
    // Embarque orphan na Arrabalde (L1) às 22:10 (distante de qualquer viagem)
    const fact = {
      stopId: stopId("A"),
      lineId: lineId("1"),
      observedAt: lisbon(THURSDAY, "22:10"),
      observedEndAt: null,
      kind: "boarded" as const,
      mode: "live" as const,
    };
    const card = buildTripCard("ride-orphan", fact, data, network, [], lisbon(THURSDAY, "22:11"))!;
    expect(card.unmatched).toBe(true);
    expect(card.unmatchedNext).toBe("próxima: sexta, 08:12");
  });

  it("buildTripCard deixa unmatchedNext nulo quando unmatched === false", async () => {
    const { data } = await fixture();
    const network = matchNetworkOf(data);
    // Embarque casado normalmente (08:12:30 na Arrabalde)
    const fact = {
      stopId: stopId("A"),
      lineId: lineId("1"),
      observedAt: lisbon(THURSDAY, "08:12", "30"),
      observedEndAt: null,
      kind: "boarded" as const,
      mode: "live" as const,
    };
    const card = buildTripCard("ride-auto", fact, data, network, [], lisbon(THURSDAY, "08:13"))!;
    expect(card.unmatched).toBe(false);
    expect(card.unmatchedNext).toBeNull();
  });
});
