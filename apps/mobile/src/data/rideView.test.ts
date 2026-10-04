/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// L1, viagem 08:10: pos. 1 = 490, 2 = 492 (Arrabalde), 3 ≈ 502,67, 4 ≈ 513,33, 5 = 524 (Campus, controle),
// 6 = 534,5, 7 = 545 (Estação, fim). Embarque às 08:12:30 na Arrabalde: atraso +0,5.
import { describe, expect, it } from "vitest";
import { lisbonWallClock } from "@notebus/domain";
import { matchNetworkOf } from "./records";
import { clockText } from "./stopCard";
import { buildAlightRows, buildTripCard, deduceBoarding, nextDestination, serviceMinuteOn } from "./rideView";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";

const boarding = (stop: "A" | "S", line: string, hhmm: string, ss = "00") => ({
  stopId: stopId(stop),
  lineId: lineId(line),
  observedAt: lisbon(THURSDAY, hhmm, ss),
  observedEndAt: null,
  kind: "boarded" as const,
  mode: "live" as const,
});

describe("nextDestination: o próximo ponto de controle", () => {
  it("da Arrabalde (pos. 2) o destino é o Campus (pos. 5, 08:44), não o fim da viagem na Estação", async () => {
    const { data } = await fixture();
    const trip = data.trips.find((t) => t.id === tripIdOf("1", "0810"))!;
    expect(nextDestination(data, trip.patternId, trip.id, 2)).toEqual({ position: 5, name: "Campus Exemplo", minute: 524 });
    // Da última posição não há ponto de controle adiante: vale o fim da viagem.
    expect(nextDestination(data, trip.patternId, trip.id, 7)).toEqual({ position: 7, name: "Estação Inventada", minute: 545 });
  });
});

describe("buildTripCard: o cartão Em viagem", () => {
  it("08:12:30 na Arrabalde: → Campus Exemplo, embarcou 08:12, chegada ~08:45 pelo atraso da viagem (+0,5)", async () => {
    const { data } = await fixture();
    const card = buildTripCard("ride-1", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(card).toMatchObject({
      rideId: "ride-1",
      line: { code: "1", color: "#7CB342" },
      destination: "Campus Exemplo",
      boardedTime: "08:12",
      stopName: "Arrabalde Inventado",
      tripStart: "08:10",
      rideDeviation: 0.5,
    });
    // Campus: base 524 (08:44) + atraso 0,5 = 524,5 → meio minuto sobe → 08:45. Sem registros, confiança "estimado": leva "~".
    expect(card.eta).toEqual({ time: "08:45", approximate: true });
    expect(card.trip).toMatchObject({ tripId: tripIdOf("1", "0810"), boardPosition: 2, serviceDate: THURSDAY });
    // A lista puxada vai até o fim do percurso; a hora de saída da viagem é a da tabela, não a deslocada.
    expect(card.ahead!.tripStart).toBe("08:10");
    expect(card.ahead!.stops.map((s) => s.position)).toEqual([3, 4, 5, 6, 7]);
  });

  it("linha \"você\" da lista puxada: embarque 08:12:30 → 08:12 (minuto cheio), como o cartão e o toast", async () => {
    const { data } = await fixture();
    const at = lisbon(THURSDAY, "08:12", "30");
    const card = buildTripCard("ride-1", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], at)!;
    // Antes: base 492 + atraso 0,5 = 492,5 → meio minuto sobe → 08:13. Agora: o instante do embarque sem os segundos.
    expect(card.ahead!.here.time).toBe("08:12");
    expect(card.boardedTime).toBe("08:12");
    // O toast do embarque usa a mesma conta (`RegistroProvider`: relógio de Lisboa, minuto cheio).
    expect(clockText(lisbonWallClock(at).minute)).toBe("08:12");
  });

  it("os horários da lista puxada seguem o atraso da própria viagem (D-070)", async () => {
    const { data } = await fixture();
    // 08:17 na Arrabalde: +5 (a base é 08:12).
    const card = buildTripCard("r", boarding("A", "1", "08:17"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:18"))!;
    expect(card.rideDeviation).toBe(5);
    // Campus: 524 + 5 = 529 = 08:49. Estação (fim): 545 + 5 = 550 = 09:10.
    expect(card.ahead!.stops.find((s) => s.position === 5)!.time).toBe("08:49");
    expect(card.ahead!.stops.find((s) => s.position === 7)!.time).toBe("09:10");
    expect(card.eta!.time).toBe("08:49");
  });

  it("sem viagem certa (orphan): usa o candidato mais perto, sem atraso (não conta)", async () => {
    const { data } = await fixture();
    // 08:58 na Arrabalde: 538. Viagem das 08:40 (base 522): +16 min (> 15 min, orphan; <= 30 min, D-159). A mais perto é a das 08:40.
    const fact = boarding("A", "1", "08:58");
    expect(deduceBoarding(fact, matchNetworkOf(data)).matchStatus).toBe("orphan");
    const card = buildTripCard("r", fact, data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:59"))!;
    expect(card.trip!.tripId).toBe(tripIdOf("1", "0840"));
    // Sem atraso aceito: o destino aparece e a chegada é a da tabela (Campus 554 = 09:14).
    expect([card.destination, card.rideDeviation, card.eta]).toEqual(["Campus Exemplo", null, { time: "09:14", approximate: true }]);
  });

  it("sem nenhum candidato (a linha não passa no ponto): cartão sem destino, sem chegada e sem lista", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("S", "2", "08:12"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect([card.destination, card.eta, card.trip, card.ahead]).toEqual([null, null, null, null]);
    expect(card.stopName).toBe("Estação Inventada");
  });

  it("ponto que sumiu dos horários: sem cartão", async () => {
    const { data } = await fixture();
    expect(buildTripCard("r", { ...boarding("A", "1", "08:12"), stopId: "nao-existe" }, data, matchNetworkOf(data), [], 0)).toBeNull();
  });

  it("orphan às 22:10 com nearest a mais de 30 min: unmatched true e destino/chegada nulos (Q-88)", async () => {
    const { data } = await fixture();
    const fact = boarding("A", "1", "22:10");
    expect(deduceBoarding(fact, matchNetworkOf(data)).matchStatus).toBe("orphan");
    const card = buildTripCard("r", fact, data, matchNetworkOf(data), [], lisbon(THURSDAY, "22:11"))!;
    expect(card.unmatched).toBe(true);
    expect([card.destination, card.eta, card.trip, card.tripStart, card.ahead]).toEqual([null, null, null, null, null]);
  });

  it("orphan com nearest a 12 min continua com destino (D-159)", async () => {
    const { data } = await fixture();
    // 08:00 na Arrabalde: 480. Base da 08:10 é 492: desvio −12 min (fora de [−5, +15] → orphan; |−12| <= 30 → D-159).
    const fact = boarding("A", "1", "08:00");
    const deduction = deduceBoarding(fact, matchNetworkOf(data));
    expect(deduction.matchStatus).toBe("orphan");
    expect(deduction.nearest!.deviation).toBe(-12);
    const card = buildTripCard("r", fact, data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:01"))!;
    expect(card.unmatched).toBe(false);
    expect(card.destination).toBe("Campus Exemplo");
    expect(card.trip!.tripId).toBe(tripIdOf("1", "0810"));
  });

  it("auto e ambiguous continuam inalterados com unmatched false e destino presente", async () => {
    const { data } = await fixture();
    // auto: 08:12:30 na Arrabalde (L1)
    const cardAuto = buildTripCard("r1", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(cardAuto.unmatched).toBe(false);
    expect(cardAuto.destination).toBe("Campus Exemplo");

    // ambiguous: 08:23 na Arrabalde (L3 passa às 08:20 e 08:26)
    const factAmbiguous = boarding("A", "3", "08:23");
    expect(deduceBoarding(factAmbiguous, matchNetworkOf(data)).matchStatus).toBe("ambiguous");
    const cardAmbiguous = buildTripCard("r2", factAmbiguous, data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:24"))!;
    expect(cardAmbiguous.unmatched).toBe(false);
    expect(cardAmbiguous.destination).not.toBeNull();
  });
});

describe("buildAlightRows: Onde você desceu?", () => {
  it("as próximas paragens, a mais provável agora primeiro, com a hora prevista pelo atraso da viagem", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("A", "1", "08:12", "30"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:46"))!;
    const rows = buildAlightRows(card, data, lisbon(THURSDAY, "08:46"));
    // Centros com o atraso +0,5: pos. 3 = 503,17; 4 = 513,83; 5 = 524,5; 6 = 535; 7 = 545,5. "Agora" = 08:46 = 526:
    // distâncias 22,8; 12,2; 1,5; 9; 19,5 → ordem 5, 6, 4, 7, 3.
    expect(rows.map((r) => r.position)).toEqual([5, 6, 4, 7, 3]);
    // Campus: 524,5 → 525 = 08:45, oficial (sem "~"); o Estádio na 2ª passagem (pos. 6) é interpolado: 535 = 08:55, "~".
    expect(rows[0]).toMatchObject({ name: "Campus Exemplo", time: "08:45", approximate: false, number: null });
    expect(rows[1]).toMatchObject({ name: "Estádio Fictício", time: "08:55", approximate: true, number: 2 });
    // O Estádio da 1ª passagem (pos. 3) é "1ª passagem"; as paragens antes do embarque não entram.
    expect(rows.find((r) => r.position === 3)).toMatchObject({ number: 1, time: "08:23" });
    expect(rows.some((r) => r.position <= 2)).toBe(false);
  });

  it("a hora prevista sem o atraso é a oficial: Campus 08:44", async () => {
    const { data } = await fixture();
    // Orphan com nearest a 16 min (<= 30 min): sem atraso aceito; a lista usa a tabela pura.
    const card = buildTripCard("r", boarding("A", "1", "08:58"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:59"))!;
    const campus = buildAlightRows(card, data, lisbon(THURSDAY, "08:59")).find((r) => r.position === 5)!;
    // Viagem das 08:40: Campus 554 = 09:14.
    expect(campus.time).toBe("09:14");
  });

  it("sem viagem conhecida a lista é vazia", async () => {
    const { data } = await fixture();
    const card = buildTripCard("r", boarding("S", "2", "08:12"), data, matchNetworkOf(data), [], lisbon(THURSDAY, "08:13"))!;
    expect(buildAlightRows(card, data, lisbon(THURSDAY, "08:13"))).toEqual([]);
  });
});

describe("serviceMinuteOn", () => {
  it("hoje: o minuto do relógio; depois da meia-noite: + 1440 no dia de serviço anterior (D-016)", () => {
    expect(serviceMinuteOn(THURSDAY, lisbon(THURSDAY, "08:46"))).toBe(526);
    // 00:12 do dia civil seguinte é o minuto 24:12 = 1452 do dia de serviço de quinta.
    expect(serviceMinuteOn(THURSDAY, lisbon("2026-10-09", "00:12"))).toBe(1452);
    expect(serviceMinuteOn(THURSDAY, lisbon("2026-10-10", "08:00"))).toBeNull();
  });
});
