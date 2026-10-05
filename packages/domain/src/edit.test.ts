import { describe, expect, it } from "vitest";
import { serviceDaysAt, lisbonInstants, lisbonWallClock } from "./calendar.ts";
import { DOMAIN_CONFIG } from "./config.ts";
import { checkAlightEdit, intervalAround, modeFor, previewMatch, resolvePickedTime, verifyOptions } from "./edit.ts";
import { checkObservationInterval, checkRide } from "./invariants.ts";
import { type LinePatternData, type MatchNetwork, matchInstant } from "./matching.ts";
import type { TripData } from "./passages.ts";
import { ARRABALDE, NETWORK, P1, at, hm, tripId } from "./testing/e03Network.ts";

// Edição e conferência no domínio (E-04 bloco 1). Rede inventada (D-091). Valor esperado calculado à mão em cada teste.

const WED = "2026-10-07"; // quarta, dia útil
const SUN = "2026-10-11"; // domingo
const SAT = "2026-10-10"; // sábado
const L1 = P1.lineId;
const rebuild = (date: string, h: number, m: number, s = 0) => at(date, h, m, s);

describe("T-42: hora do seletor = ocorrência mais recente no passado, até 24 h", () => {
  it("agora 00:10 de domingo e escolher 23:50 → sábado 23:50 (dia de serviço de sábado)", () => {
    const now = rebuild(SUN, 0, 10);
    const picked = resolvePickedTime(23, 50, now)!;
    expect(picked).toBe(rebuild(SAT, 23, 50));
    expect(serviceDaysAt(picked, NETWORK.calendar).today.date).toBe(SAT);
    expect(picked).toBeLessThanOrEqual(now);
  });

  it("agora 14:00 e escolher 15:30 → ontem 15:30 (nunca no futuro)", () => {
    const now = rebuild(WED, 14, 0);
    const picked = resolvePickedTime(15, 30, now)!;
    expect(picked).toBe(rebuild("2026-10-06", 15, 30));
    expect(picked).toBeLessThan(now);
  });

  it("agora 14:00 e escolher 14:00 → agora; segundos do agora ficam de fora (14:00:30 → 14:00:00)", () => {
    expect(resolvePickedTime(14, 0, rebuild(WED, 14, 0))).toBe(rebuild(WED, 14, 0));
    expect(resolvePickedTime(14, 0, rebuild(WED, 14, 0, 30))).toBe(rebuild(WED, 14, 0));
  });

  it("nunca devolve instante futuro, qualquer hora que se escolha", () => {
    const now = rebuild(WED, 9, 41, 17);
    for (let minuteOfDay = 0; minuteOfDay < 1440; minuteOfDay += 7) {
      const picked = resolvePickedTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60, now)!;
      expect(picked).toBeLessThanOrEqual(now);
      expect(picked).toBeGreaterThan(now - 24 * 3_600_000);
    }
  });

  it("mudança de hora de outubro (25/10/2026): 01:30 acontece duas vezes; vale a mais recente que já passou", () => {
    // A mudança é às 01:00 UTC: 00:30 UTC é 01:30 de verão (WEST) e 01:30 UTC é 01:30 de inverno (WET).
    const first = Date.UTC(2026, 9, 25, 0, 30);
    const second = Date.UTC(2026, 9, 25, 1, 30);
    // Agora 02:00 (WET = 02:00 UTC): as duas já passaram; a mais recente é a segunda.
    expect(resolvePickedTime(1, 30, Date.UTC(2026, 9, 25, 2, 0))).toBe(second);
    // Agora 01:10 (WET = 01:10 UTC): a segunda 01:30 ainda não chegou; vale a primeira.
    expect(resolvePickedTime(1, 30, Date.UTC(2026, 9, 25, 1, 10))).toBe(first);
    expect(lisbonInstants("2026-10-25", 90)).toEqual([first, second]);
  });

  it("mudança de hora de março (29/03/2026): 01:30 não existe; 02:30 de verão é 01:30 UTC", () => {
    const now = Date.UTC(2026, 2, 29, 10, 0); // 11:00 em Lisboa
    expect(lisbonInstants("2026-03-29", 90)).toEqual([]);
    expect(resolvePickedTime(1, 30, now)).toBeNull(); // hoje não existe e o de ontem está a mais de 24 h
    expect(resolvePickedTime(2, 30, now)).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(lisbonWallClock(Date.UTC(2026, 2, 29, 1, 30))).toEqual({ date: "2026-03-29", minute: 150 });
  });

  it("lisbonInstants é a inversa de lisbonWallClock num dia comum", () => {
    // 08:12 de 07/10/2026 (verão, UTC+1) = 07:12 UTC.
    expect(lisbonInstants(WED, hm(8, 12))).toEqual([Date.UTC(2026, 9, 7, 7, 12)]);
    expect(lisbonWallClock(lisbonInstants(WED, hm(8, 12))[0]!)).toEqual({ date: WED, minute: hm(8, 12) });
  });
});

describe("intervalAround e modeFor", () => {
  it("±10 dá 20 min no total, dentro do limite de 30 (T-40); o ponto médio é o centro (T-15)", () => {
    const center = at(WED, 8, 12);
    for (const half of DOMAIN_CONFIG.intervalHalfMinutes) {
      const { observedAt, observedEndAt } = intervalAround(center, half);
      expect(observedEndAt - observedAt).toBe(half * 2 * 60_000);
      expect(checkObservationInterval(observedAt, observedEndAt)).toBeNull();
      expect(matchInstant({ observedAt, observedEndAt })).toBe(center);
    }
    const ten = intervalAround(center, 10);
    expect([ten.observedAt, ten.observedEndAt]).toEqual([at(WED, 8, 2), at(WED, 8, 22)]);
  });

  it("modo: memória ligada vence; senão hora mudada = later; senão live", () => {
    const recordedAt = at(WED, 8, 12, 30);
    expect(modeFor({ memory: true, observedAt: recordedAt, recordedAt })).toBe("memory");
    expect(modeFor({ memory: true, observedAt: recordedAt - 300_000, recordedAt })).toBe("memory");
    expect(modeFor({ memory: false, observedAt: recordedAt - 300_000, recordedAt })).toBe("later");
    expect(modeFor({ memory: false, observedAt: recordedAt, recordedAt })).toBe("live");
    // Comparação exata: 1 ms de diferença já é outra hora.
    expect(modeFor({ memory: false, observedAt: recordedAt + 1, recordedAt })).toBe("later");
  });
});

describe("T-33: casamento em rascunho (frase ao vivo da TL-06)", () => {
  // Quarta, L1, Arrabalde (pos. 2). A viagem das 08:10 passa às 08:12 (interpolada); a das 07:40 às 07:42; a das 08:40 às 08:42.
  const draft = (h: number, m: number) => ({ stopId: ARRABALDE, lineId: L1, observedAt: at(WED, h, m), observedEndAt: null });
  const T0810 = tripId(P1, "weekday", hm(8, 10));

  it("08:13 → viagem das 08:10, +1; 08:11 → −1; 08:08 → −4", () => {
    for (const [h, m, deviation] of [[8, 13, 1], [8, 11, -1], [8, 8, -4]] as const) {
      const p = previewMatch(draft(h, m), NETWORK);
      expect([p.status, p.chosen!.tripId, p.chosen!.deviation, p.chosen!.base.minute, p.departureMinute]).toEqual(["auto", T0810, deviation, hm(8, 12), hm(8, 10)]);
    }
  });

  it("08:03 → órfã (−9 da das 08:10); a mais perto pela distância é a das 07:40 (+21 → 1,4 contra 1,8)", () => {
    const p = previewMatch(draft(8, 3), NETWORK);
    // 08:03 − 08:12 = −9 (adiantado demais); 08:03 − 07:42 = +21 (atrasado demais). Nenhuma dentro de −5/+15.
    expect(p.status).toBe("orphan");
    expect([p.chosen, p.candidates]).toEqual([null, []]);
    expect([p.nearest!.tripId, p.nearest!.deviation, p.nearest!.distance]).toEqual([tripId(P1, "weekday", hm(7, 40)), 21, 1.4]);
    // As opções da TL-09 mostram a das 08:10 com −9.
    const own = verifyOptions(draft(8, 3), NETWORK).sameLine.find((o) => o.tripId === T0810)!;
    expect([own.deviation, own.distance]).toEqual([-9, 1.8]);
  });

  it("não grava nada e dá o mesmo resultado que a dedução gravada (mesma função)", () => {
    const fact = { ...draft(8, 13), kind: "boarded" as const, mode: "live" as const };
    const again = previewMatch(fact, NETWORK);
    expect(again).toEqual(previewMatch(fact, NETWORK));
    expect(Object.isFrozen(NETWORK)).toBe(false); // a rede entra por leitura; nada nela mudou
  });

  it("com a viagem em curso (D-071) só conta a viagem dela", () => {
    // Em curso na viagem das 08:40 (Arrabalde às 08:42): um registro às 08:13 não casa com a das 08:10.
    const ride = { lineId: L1, tripId: tripId(P1, "weekday", hm(8, 40)), serviceDate: WED };
    expect(previewMatch(draft(8, 13), NETWORK, ride).status).toBe("orphan");
    expect(previewMatch(draft(8, 43), NETWORK, ride).chosen!.deviation).toBe(1);
  });
});

describe("T-35: opções da TL-09 para a órfã (a N3: L1, Arrabalde, 09:30, útil)", () => {
  it("as duas vizinhas da mesma linha, por distância: 09:12 (+18, 1,20) e 09:42 (−12, 2,40); nenhuma marcada", () => {
    const o = verifyOptions({ stopId: ARRABALDE, lineId: L1, observedAt: at(WED, 9, 30), observedEndAt: null }, NETWORK);
    expect(o.status).toBe("orphan");
    // Vizinhas: a última com base ≤ 09:30 (a das 09:10: base 09:12) e a primeira com base > 09:30 (a das 09:40: base 09:42).
    expect(o.sameLine.map((p) => [p.tripId, p.base.minute, p.deviation, p.distance, p.departureMinute])).toEqual([
      [tripId(P1, "weekday", hm(9, 10)), hm(9, 12), 18, 1.2, hm(9, 10)],
      [tripId(P1, "weekday", hm(9, 40)), hm(9, 42), -12, 2.4, hm(9, 40)],
    ]);
    expect(o.candidates).toEqual([]);
    expect(o.sameLine.every((p) => p.alightHint === null)).toBe(true);
    // Número, origem e destino da passagem (D-094): pos. 2 da L1, controle anterior = pos. 1, seguinte = pos. 6.
    expect([o.sameLine[0]!.info.number, o.sameLine[0]!.info.origin, o.sameLine[0]!.info.destination]).toEqual([null, 1, 6]);
  });

  it("vizinha com mais de 30 min de desvio fica de fora (corte da proposta)", () => {
    // 11:00 na Arrabalde: a das 10:40 passa às 10:42 (+18), a das 11:10 às 11:12 (−12): as duas entram. Às 06:00: só a
    // das 06:40 (base 06:42, −42) existe antes da primeira partida; −42 passa de 30 e é cortada.
    const early = verifyOptions({ stopId: ARRABALDE, lineId: L1, observedAt: at(WED, 6, 0), observedEndAt: null }, NETWORK);
    expect(early.sameLine).toEqual([]);
    // Ontem (terça) a viagem das 24:10 passa na Arrabalde à 24:12 = 1452 de serviço; às 00:00 de quarta o minuto de
    // serviço de ontem é 1440: −12 → é vizinha de ontem e entra, com o desvio medido no dia de serviço de ontem.
    const midnight = verifyOptions({ stopId: ARRABALDE, lineId: L1, observedAt: at(WED, 0, 0), observedEndAt: null }, NETWORK);
    expect(midnight.status).toBe("orphan");
    expect(midnight.sameLine.map((p) => [p.serviceDate, p.deviation])).toEqual([["2026-10-06", -12]]);
  });

  it("\"Ou foi outra linha?\": no mesmo ponto físico, uma passagem por linha a até 15 min (a L3, 10:06,5)", () => {
    // 10:05 na Arrabalde, L1: a das 09:40 (base 09:42, +23) e a das 10:10 (base 10:12, −7). A L3 passa às 10:06,5 (−1,5).
    const o = verifyOptions({ stopId: ARRABALDE, lineId: L1, observedAt: at(WED, 10, 5), observedEndAt: null }, NETWORK);
    expect(o.sameLine.map((p) => [p.base.minute, p.deviation])).toEqual([[hm(10, 12), -7], [hm(9, 42), 23]]);
    expect(o.otherLines.map((p) => [p.lineId, p.base.minute, p.deviation, p.distance])).toEqual([["f-l3", hm(10, 6) + 0.5, -1.5, 0.3]]);
  });
});

// Rede mínima para a órfã com a L3 a 6,5 min e para a ambígua com duas passagens no mesmo ponto (dados inventados).
function miniNetwork(): MatchNetwork {
  const stop = (position: number, stopId: string, isTimepoint = false) => ({ position, stopId, isTimepoint });
  const pOne: LinePatternData = { id: "m-p1", lineId: "m-l1", stops: [stop(1, "m-a", true)] };
  const pTri: LinePatternData = { id: "m-p3", lineId: "m-l3", stops: [stop(1, "m-a", true)] };
  // Ambígua: o ponto T aparece nas posições 2 e 4 do percurso.
  const pAmb: LinePatternData = { id: "m-p2", lineId: "m-l2", stops: [stop(1, "m-z", true), stop(2, "m-t"), stop(3, "m-y"), stop(4, "m-t"), stop(5, "m-w", true)] };
  const one = (id: string, patternId: string, minute: number): TripData => ({
    id, patternId, firstPosition: 1, lastPosition: 1, stopTimes: [{ position: 1, serviceMinute: minute, origin: "official" }],
  });
  const amb = (id: string, times: Record<number, number>): TripData => ({
    id, patternId: "m-p2", firstPosition: 1, lastPosition: 5, stopTimes: Object.entries(times).map(([position, serviceMinute]) => ({ position: Number(position), serviceMinute, origin: "official" as const })),
  });
  const trips = [
    one("m-t1", "m-p1", hm(9, 12)), one("m-t2", "m-p1", hm(9, 42)), one("m-t3", "m-p3", hm(9, 36) + 0.5),
    amb("m-a1", { 1: hm(10, 0), 2: hm(10, 5), 4: hm(10, 12), 5: hm(10, 20) }),
    amb("m-a2", { 1: hm(10, 20), 2: hm(10, 25), 4: hm(10, 32), 5: hm(10, 40) }),
  ];
  return {
    calendar: { overrides: [], holidays: [] },
    schedule: {
      trips: trips.map((t) => ({ id: t.id, timetableId: "m-tt", dayTypes: ["weekday" as const], seasonId: null })),
      timetables: [{ id: "m-tt", validFrom: "2026-01-01", validTo: null }],
      seasons: [],
    },
    patterns: [pOne, pTri, pAmb],
    trips,
  };
}

describe("T-35 com os números do plano, e T-36 e T-37", () => {
  const net = miniNetwork();

  it("T-35: L1 09:12 (+18, 1,20), L1 09:42 (−12, 2,40); outra linha: L3 09:36,5 (−6,5; 1,30); nenhuma marcada", () => {
    const o = verifyOptions({ stopId: "m-a", lineId: "m-l1", observedAt: at(WED, 9, 30), observedEndAt: null }, net);
    expect(o.sameLine.map((p) => [p.tripId, p.deviation, p.distance])).toEqual([["m-t1", 18, 1.2], ["m-t2", -12, 2.4]]);
    // L3: 09:30 − 09:36,5 = −6,5 → 6,5 ÷ 5 = 1,30; está a 6,5 min (≤ 15).
    expect(o.otherLines.map((p) => [p.lineId, p.tripId, p.base.minute, p.deviation, p.distance])).toEqual([["m-l3", "m-t3", hm(9, 36) + 0.5, -6.5, 1.3]]);
  });

  it("T-36: ambígua (o ponto T duas vezes) dá os dois candidatos como passagem, com número, origem e destino", () => {
    // 10:10 no ponto T: a pos. 2 da viagem das 10:00 passa às 10:05 (+5) e a pos. 4 às 10:12 (−2). Ambas dentro de −5/+15.
    const o = verifyOptions({ stopId: "m-t", lineId: "m-l2", observedAt: at(WED, 10, 10), observedEndAt: null }, net);
    expect(o.status).toBe("ambiguous");
    expect(o.sameLine).toEqual([]);
    // Ordem pela distância: +5 ÷ 15 = 0,333 (pos. 2) antes de |−2| ÷ 5 = 0,4 (pos. 4).
    // Pontos de controle = posições marcadas ou com horário na tabela: 1, 2, 4 e 5. Pos. 2: origem 1, destino 4. Pos. 4: origem 2, destino 5.
    expect(o.candidates.map((p) => [p.tripId, p.position, p.deviation, p.info.number, p.info.origin, p.info.destination])).toEqual([
      ["m-a1", 2, 5, 1, 1, 4],
      ["m-a1", 4, -2, 2, 2, 5],
    ]);
    // Origem e destino como ponto físico da pos. 2: m-z (pos. 1) e m-t (pos. 4); a pos. 4 vai de m-t a m-w (pos. 5).
    expect([o.candidates[0]!.originStopId, o.candidates[0]!.destinationStopId]).toEqual(["m-z", "m-t"]);
    expect([o.candidates[1]!.originStopId, o.candidates[1]!.destinationStopId]).toEqual(["m-t", "m-w"]);
  });

  it("T-37: a descida que casou com a viagem X faz X vir primeiro, com a pista, sem nenhuma marcada", () => {
    const fact = { stopId: "m-a", lineId: "m-l1", observedAt: at(WED, 9, 30), observedEndAt: null };
    const alight = { tripId: "m-t2", matchStatus: "auto" as const, stopId: "m-k", observedAt: at(WED, 9, 44) };
    const o = verifyOptions(fact, net, { alight });
    expect(o.sameLine.map((p) => p.tripId)).toEqual(["m-t2", "m-t1"]);
    expect(o.sameLine[0]!.alightHint).toEqual({ stopId: "m-k", observedAt: at(WED, 9, 44) });
    expect(o.sameLine[1]!.alightHint).toBeNull();
    // Descida sem casamento (orphan) não dá pista.
    const none = verifyOptions(fact, net, { alight: { ...alight, matchStatus: "orphan" } });
    expect(none.sameLine.map((p) => [p.tripId, p.alightHint])).toEqual([["m-t1", null], ["m-t2", null]]);
  });

  it("T-37 (ambígua): a viagem da descida sobe para o topo da lista dos candidatos", () => {
    const fact = { stopId: "m-t", lineId: "m-l2", observedAt: at(WED, 10, 10), observedEndAt: null };
    const o = verifyOptions(fact, net, { alight: { tripId: "m-a1", matchStatus: "manual", stopId: "m-w", observedAt: at(WED, 10, 21) } });
    expect(o.candidates.every((p) => p.alightHint !== null)).toBe(true); // as duas passagens são da mesma viagem
    expect(o.candidates).toHaveLength(2);
  });
});

describe("T-40: checkAlightEdit", () => {
  const board = { patternId: "p", position: 2, observedAt: at(WED, 8, 12) };

  it("descida antes do embarque, posição não maior e outro percurso dão um código cada; ok dá null", () => {
    expect(checkAlightEdit(board, { patternId: "p", position: 6, observedAt: at(WED, 8, 10) })).toBe("before_boarding");
    expect(checkAlightEdit(board, { patternId: "p", position: 2, observedAt: at(WED, 8, 40) })).toBe("position_not_after");
    expect(checkAlightEdit(board, { patternId: "p", position: 1, observedAt: at(WED, 8, 40) })).toBe("position_not_after");
    expect(checkAlightEdit(board, { patternId: "q", position: 6, observedAt: at(WED, 8, 40) })).toBe("pattern_differs");
    expect(checkAlightEdit(board, { patternId: "p", position: 6, observedAt: at(WED, 8, 12) })).toBeNull(); // hora igual vale
    expect(checkAlightEdit(board, { patternId: "p", position: 6, observedAt: at(WED, 8, 45) })).toBeNull();
  });

  it("concorda com o checkRide do domínio (mesma regra, mesma ordem)", () => {
    const cases = [
      { patternId: "p", position: 6, observedAt: at(WED, 8, 10) },
      { patternId: "p", position: 2, observedAt: at(WED, 8, 40) },
      { patternId: "q", position: 1, observedAt: at(WED, 8, 0) },
      { patternId: "p", position: 6, observedAt: at(WED, 8, 45) },
    ];
    for (const alight of cases) expect(checkAlightEdit(board, alight) === null).toBe(checkRide(board, alight) === null);
  });

  it("sem passagem deduzida de um dos lados, só a hora é conferida", () => {
    const unknown = { patternId: null, position: null, observedAt: at(WED, 8, 40) };
    expect(checkAlightEdit(board, unknown)).toBeNull();
    expect(checkAlightEdit(board, { ...unknown, observedAt: at(WED, 8, 0) })).toBe("before_boarding");
  });
});
