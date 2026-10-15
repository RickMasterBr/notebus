import { describe, expect, it } from "vitest";
import { estimateDeviation, type PassageRecord, type PassageTarget } from "./passages.ts";
import { ARRABALDE, P1, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// `last` de `estimateDeviation`: a posição (e o resto) vem do registro, não do alvo (L23, B11-4). Rede inventada (D-091).

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

describe("estimateDeviation.last.position (L23)", () => {
  it("1: nível pattern, único registro de outro ponto → position é a do registro, não a do alvo", () => {
    // Nenhum registro na Arrabalde (pos. 2): só o da pos. 3 → nível pattern; last.position = 3.
    const r = rec(5, { stopId: "f-l1-3", position: 3, daysAgo: 1 });
    const e = est([r]);
    expect(e.level).toBe("pattern");
    expect(e.last?.position).toBe(3);
    expect(e.last?.position).not.toBe(TARGET.position);
    expect(e.last?.tripId).toBe(r.tripId);
    expect(e.last?.deviation).toBe(5);
  });

  it("2: nível pattern, o mais recente entre posições diferentes → o da pos. 4", () => {
    // Pos. 3 há 4 dias (desvio 2) e pos. 4 há 1 dia (desvio 7): o maior observedAt é o da pos. 4.
    const e = est([rec(2, { stopId: "f-l1-3", position: 3, daysAgo: 4 }), rec(7, { stopId: "f-l1-4", position: 4, daysAgo: 1 })]);
    expect(e.level).toBe("pattern");
    expect(e.last?.position).toBe(4);
    expect(e.last?.deviation).toBe(7);
  });

  it("3: nível stop, outra passagem do mesmo ponto físico → position 5 e a viagem das 09:10", () => {
    // O nível stop olha o ponto (stopId), não a posição: a pos. 5 na Arrabalde, viagem das 09:10, entra.
    const e = est([rec(4, { position: 5, daysAgo: 2, start: hm(9, 10) })]);
    expect(e.level).toBe("stop");
    expect(e.last?.position).toBe(5);
    expect(e.last?.tripId).toBe(T0910);
  });

  it("4: o nível trip exige a mesma posição; a pos. 5 só entra no nível stop", () => {
    // Mesma viagem 08:10 e Arrabalde: pos. 2 (desvio 1, 3 dias atrás) é trip; pos. 5 (desvio 8, hoje) não é.
    const e = est([rec(1, { position: 2, daysAgo: 3 }), rec(8, { position: 5, daysAgo: 0 })]);
    expect(e.level).toBe("trip");
    expect(e.count).toBe(1);
    expect(e.last?.position).toBe(2);
    expect(e.last?.deviation).toBe(1);
  });

  it("5: serviceDate e observedAt vêm do registro, não do alvo nem do agora", () => {
    // Nível pattern; o registro é de 2026-10-05, observado 2 dias antes de NOW.
    const e = est([rec(3, { stopId: "f-l1-3", position: 3, daysAgo: 2, serviceDate: "2026-10-05" })]);
    expect(e.level).toBe("pattern");
    expect(e.last?.serviceDate).toBe("2026-10-05");
    expect(e.last?.observedAt).toBe(NOW - 2 * DAY_MS);
  });

  it("6: só auto e manual valem na posição → o orphan mais novo (pos. 4) não entra", () => {
    // Orphan de hoje na pos. 4 fica fora; o manual da pos. 3, mais antigo, é o aceito.
    const e = est([rec(9, { stopId: "f-l1-4", position: 4, matchStatus: "orphan" }), rec(2, { stopId: "f-l1-3", position: 3, matchStatus: "manual", daysAgo: 3 })]);
    expect(e.count).toBe(1);
    expect(e.last?.position).toBe(3);
  });
});
