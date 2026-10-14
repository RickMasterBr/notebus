import { describe, expect, it } from "vitest";
import { estimateDeviation, type PassageRecord, type PassageTarget } from "./passages.ts";
import { ARRABALDE, P1, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// `last` de `estimateDeviation` (T-133, D-197): o registro aceito mais recente do nível usado. Rede inventada (D-091).

const DAY_MS = 86_400_000;
const WED = "2026-10-07";
const NOW = at(WED, 7, 0);
const T0810 = tripId(P1, "weekday", hm(8, 10));
const T0910 = tripId(P1, "weekday", hm(9, 10));
const TARGET: PassageTarget = { tripId: T0810, patternId: P1.id, position: 2, stopId: ARRABALDE, dayType: "weekday", validFrom: VALID_FROM };

/** Um registro aceito na Arrabalde (pos. 2). Por padrão: viagem das 08:10, de hoje, `auto`, ao vivo, embarque. */
function rec(deviation: number, o: Partial<PassageRecord> & { daysAgo?: number; start?: number } = {}): PassageRecord {
  const { daysAgo = 0, start = hm(8, 10), ...rest } = o;
  return {
    deviation,
    observedAt: NOW - daysAgo * DAY_MS,
    serviceDate: WED,
    dayType: "weekday",
    tripId: tripId(P1, "weekday", start),
    patternId: P1.id,
    position: 2,
    stopId: ARRABALDE,
    matchStatus: "auto",
    mode: "live",
    kind: "boarded",
    ...rest,
  };
}
const est = (records: PassageRecord[]) => estimateDeviation("interpolated", records, TARGET, NOW);

describe("estimateDeviation.last (T-133)", () => {
  it("1: três da mesma viagem (0, 2 e 7 dias atrás) → o de 0 dias", () => {
    // Nível trip (3 registros); o maior observedAt é NOW − 0 d = NOW, e o desvio dele é 3.
    const e = est([rec(1, { daysAgo: 7 }), rec(3, { daysAgo: 0 }), rec(2, { daysAgo: 2 })]);
    expect(e.level).toBe("trip");
    expect(e.last).toEqual({ observedAt: NOW, deviation: 3, serviceDate: WED, tripId: T0810, position: 2 });
  });

  it("2: nível trip com registro antigo; outra viagem do ponto é mais recente → last é o da viagem", () => {
    // trip: só o de 5 dias atrás (desvio 4); a viagem das 09:10 tem um de hoje (desvio 9) mas é o nível stop, que não é o usado.
    const e = est([rec(4, { daysAgo: 5 }), rec(9, { daysAgo: 0, start: hm(9, 10) })]);
    expect(e.level).toBe("trip");
    expect(e.last?.observedAt).toBe(NOW - 5 * DAY_MS);
    expect(e.last?.deviation).toBe(4);
  });

  it("3: o mais recente é ambiguous ou orphan → não entra", () => {
    // Aceitos: 3 dias (desvio 2) e 6 dias (desvio 1). Hoje há um ambiguous (8) e um orphan (7): fora.
    const e = est([rec(8, { matchStatus: "ambiguous" }), rec(7, { matchStatus: "orphan" }), rec(2, { daysAgo: 3 }), rec(1, { daysAgo: 6 })]);
    expect(e.count).toBe(2);
    expect(e.last?.deviation).toBe(2);
    expect(e.last?.observedAt).toBe(NOW - 3 * DAY_MS);
  });

  it("4: mesmo observedAt → o que vem depois na lista; invertendo a ordem, inverte o resultado", () => {
    // Os dois são de hoje (mesmo instante): [1, 5] → 5; [5, 1] → 1.
    expect(est([rec(1), rec(5)]).last?.deviation).toBe(5);
    expect(est([rec(5), rec(1)]).last?.deviation).toBe(1);
  });

  it("5: sem registros aceitos → level none e last null", () => {
    // Só um ambiguous: nenhum aceito.
    const e = est([rec(3, { matchStatus: "ambiguous" })]);
    expect(e.level).toBe("none");
    expect(e.last).toBeNull();
    expect(est([]).last).toBeNull();
  });

  it("6: nível stop (nenhum da viagem) → tripId do registro, não o do alvo", () => {
    // Só a viagem das 09:10 (1 dia atrás) tem registro no ponto: nível stop; last.tripId = T0910, não T0810.
    const e = est([rec(6, { daysAgo: 1, start: hm(9, 10) })]);
    expect(e.level).toBe("stop");
    expect(e.last?.tripId).toBe(T0910);
    expect(e.last?.tripId).not.toBe(TARGET.tripId);
  });
});
