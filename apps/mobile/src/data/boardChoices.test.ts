/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1); minutos de
// serviço: 08:00 = 480. Cada teste traz o valor esperado calculado à mão no comentário.
import type { PassageRecord } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { boardChoices, relativeMinutes, suggestStop } from "./boardChoices";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";

describe("suggestStop: o ponto sugerido, sem localização", () => {
  // Sábado 10/10 e quinta 08/10 de 2026: o calendário do domínio dá o tipo do dia.
  const visit = (stop: "A" | "K", date: string, hhmm: string, kind: "boarded" | "passed" | "alighted" = "boarded") => ({
    stopId: stopId(stop),
    observedAt: lisbon(date, hhmm),
    kind,
  });

  it("(1) o ponto mais registrado neste tipo de dia e nesta faixa de horário (±60 min)", async () => {
    const { data } = await fixture();
    const history = [
      visit("A", "2026-10-05", "07:40"), // segunda, 07:40: dentro de 08:00 ± 60 → A
      visit("A", "2026-10-06", "08:10"), // A
      visit("A", "2026-10-07", "08:50"), // A
      visit("K", "2026-10-02", "08:05"), // K
      visit("K", "2026-10-03", "08:00"), // sábado: outro tipo de dia, não conta
      visit("K", "2026-10-06", "18:00"), // fora da faixa, não conta
    ];
    // A: 3 registros na faixa; K: 1 (o de sexta 08:05). Vence A.
    expect(suggestStop(history, lisbon(THURSDAY, "08:00"), data, null)).toBe(stopId("A"));
  });

  it("empate: o registrado mais recentemente", async () => {
    const { data } = await fixture();
    const history = [visit("A", "2026-10-05", "08:00"), visit("A", "2026-10-06", "08:00"), visit("K", "2026-10-02", "08:00"), visit("K", "2026-10-07", "08:00")];
    // 2 a 2; o K mais recente é o de 07/10 e o A mais recente o de 06/10: vence K.
    expect(suggestStop(history, lisbon(THURSDAY, "08:00"), data, null)).toBe(stopId("K"));
  });

  it("a descida não conta como ponto de embarque; 'vi passar' conta como presença no ponto", async () => {
    const { data } = await fixture();
    const history = [visit("K", "2026-10-05", "08:00", "alighted"), visit("K", "2026-10-06", "08:00", "alighted"), visit("A", "2026-10-07", "08:00", "passed")];
    expect(suggestStop(history, lisbon(THURSDAY, "08:00"), data, null)).toBe(stopId("A"));
  });

  it("(2) sem histórico na faixa: o último ponto usado; sem registro nenhum, o último aberto", async () => {
    const { data } = await fixture();
    const evening = [visit("A", "2026-10-05", "18:00"), visit("K", "2026-10-06", "19:00")];
    // Nenhum registro perto das 08:00 de dia útil: vale o do registro mais recente (K, 06/10 19:00).
    expect(suggestStop(evening, lisbon(THURSDAY, "08:00"), data, stopId("A"))).toBe(stopId("K"));
    // Sem nenhum registro: o último ponto aberto.
    expect(suggestStop([], lisbon(THURSDAY, "08:00"), data, stopId("A"))).toBe(stopId("A"));
  });

  it("(3) sem nenhum registro nem ponto recente: nada (a folha pede para escolher o ponto)", async () => {
    const { data } = await fixture();
    expect(suggestStop([], lisbon(THURSDAY, "08:00"), data, null)).toBeNull();
  });
});

describe("boardChoices: as linhas da folha", () => {
  it("lista cada passagem do ponto, a esperada mais perto de agora primeiro; a linha que passa duas vezes aparece duas vezes", async () => {
    const { data } = await fixture();
    const rows = boardChoices(stopId("A"), data, [], lisbon(THURSDAY, "08:00"));
    // 08:00 = 480. Na Arrabalde: L1 pos. 2 (viagem 08:10 = 492, daqui a 12), L3 pos. 1 (500, 20), L3 pos. 3 (506, 26),
    // L2 pos. 1 (510, 30). A viagem das 08:40 da L1 (522, 42) fica atrás da das 08:10 (a mais perto de cada passagem).
    expect(rows.map((r) => [r.code, r.position, r.time, r.minutesAhead])).toEqual([
      ["1", 2, "08:12", 12],
      ["3", 1, "08:20", 20],
      ["3", 3, "08:26", 26],
      ["2", 1, "08:30", 30],
    ]);
    // O destino é o próximo ponto de controle: a L3 aparece duas vezes, com destinos diferentes (4.1 §6.2).
    expect(rows.filter((r) => r.code === "3").map((r) => r.destination)).toEqual(["Praça X", "Campus Exemplo"]);
    // A L1 daqui vai ao Campus (pos. 5, o próximo ponto de controle depois da pos. 2); a L2, ao Campus também.
    expect(rows.filter((r) => r.code !== "3").map((r) => r.destination)).toEqual(["Campus Exemplo", "Campus Exemplo"]);
    expect(rows.map((r) => r.highlighted)).toEqual([true, false, false, false]);
    expect(rows[0]).toMatchObject({ lineId: lineId("1"), tripId: tripIdOf("1", "0810"), approximate: true, confidence: "estimated" });
  });

  it("a passagem que termina no ponto não serve para embarcar (última posição da viagem)", async () => {
    const { data } = await fixture();
    // No Campus: L1 pos. 5 embarca; L2 pos. 2 e L3 pos. 4 são o fim do percurso e ficam de fora.
    const rows = boardChoices(stopId("K"), data, [], lisbon(THURSDAY, "08:00"));
    expect(rows.map((r) => [r.code, r.position])).toEqual([["1", 5]]);
  });

  it("a passagem que já passou entra se é a mais perto: 08:13 → a das 08:12 ('há 1 min') vence a das 08:42", async () => {
    const { data } = await fixture();
    const rows = boardChoices(stopId("A"), data, [], lisbon(THURSDAY, "08:13"));
    const l1 = rows.find((r) => r.code === "1")!;
    expect([l1.time, l1.minutesAhead]).toEqual(["08:12", -1]);
    expect(relativeMinutes(l1.minutesAhead)).toEqual({ kind: "ago", minutes: 1 });
    expect(relativeMinutes(12)).toEqual({ kind: "in", minutes: 12 });
    expect(relativeMinutes(0.4)).toEqual({ kind: "now" });
  });

  it("o horário esperado já leva os registros do usuário (D-070 não, o histórico: encolhimento)", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const trip = data.trips.find((t) => t.id === tripIdOf("1", "0810"))!;
    const record: PassageRecord = {
      deviation: 6,
      observedAt: now, // idade 0 → peso 1
      serviceDate: THURSDAY,
      dayType: "weekday",
      tripId: trip.id,
      patternId: trip.patternId,
      position: 2,
      stopId: stopId("A"),
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };
    const rows = boardChoices(stopId("A"), data, [record], now);
    const l1 = rows.find((r) => r.code === "1")!;
    // 1 registro de +6 (n = 1) e o nível de cima (o ponto) com a mesma mediana +6: (1×6 + 3×6) / 4 = +6 → 492 + 6 = 498 = 08:18.
    expect([l1.time, l1.confidence]).toEqual(["08:18", "low"]);
  });
});
