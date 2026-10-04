import { describe, expect, it } from "vitest";
import { recordWeight, weightedQuantile } from "./estimate.ts";
import { deduceObservation, type ObservationFact } from "./matching.ts";
import {
  baseTimeAt,
  displayBeAtStop,
  displayCenter,
  estimateDeviation,
  expectedTime,
  inRideExpected,
  latestRideDeviation,
  type PassageRecord,
  type PassageTarget,
} from "./passages.ts";
import { formatServiceMinute } from "./serviceMinute.ts";
import { ARRABALDE, NETWORK, P1, VALID_FROM, at, hm, trip, tripId } from "./testing/e03Network.ts";

// Horário esperado com os registros (E-03 §3.4, P-04 §3, D-022, D-073, D-120) e dentro da viagem (D-070),
// sobre a rede inventada de `testing/e03Network.ts` (D-091). Cada valor esperado tem a conta ao lado.

const DAY_MS = 86_400_000;
const WED = "2026-10-07";
const NOW = at(WED, 7, 0);
const T0810 = tripId(P1, "weekday", hm(8, 10));
const BASE = baseTimeAt(trip(T0810), 2)!; // 08:12, interpolado (±4)
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
const est = (records: PassageRecord[]) => estimateDeviation(BASE.kind, records, TARGET, NOW);
const exp = (records: PassageRecord[]) => expectedTime(BASE, records, { target: TARGET, now: NOW });
const fmt = (m: number) => formatServiceMinute(m);
/** n registros de +2 em outras viagens do mesmo ponto (09:10, 09:40, …): o nível (b) "o ponto tem mediana +2". */
const pointAt2 = (n: number) => Array.from({ length: n }, (_, i) => rec(2, { start: hm(9, 10) + 30 * i }));

describe("pesos (P-04 §3.3, T-97)", () => {
  it("T-97: hoje 1; 28 dias 0,5; 56 dias 0,25; \"de memória\" de hoje 0,5; antes da vigência 0,25", () => {
    const w = (r: PassageRecord) => recordWeight(r, NOW, VALID_FROM);
    // 0,5^(0/28) = 1; 0,5^(28/28) = 0,5; 0,5^(56/28) = 0,25; 1 × 0,5 (memória); 1 × 0,25 (31/08 < 01/09).
    expect([w(rec(0)), w(rec(0, { daysAgo: 28 })), w(rec(0, { daysAgo: 56 })), w(rec(0, { mode: "memory" })), w(rec(0, { serviceDate: "2026-08-31" }))]).toEqual([
      1, 0.5, 0.25, 0.5, 0.25,
    ]);
    // Os fatores multiplicam: de memória, de 28 dias e antes da vigência = 0,5 × 0,5 × 0,25 = 0,0625.
    expect(w(rec(0, { daysAgo: 28, mode: "memory", serviceDate: "2026-08-01" }))).toBe(0.0625);
  });
});

describe("centro encolhido (D-120, T-98)", () => {
  it("T-98: 1 registro de +6 com o ponto em +2 → +3; 9 de +6 → +5; 1 \"de memória\" de +6 → ≈ +2,57", () => {
    // (1) Nível (a) = {+6}, n = 1. Nível (b) = 10 × (+2) + {+6}: mediana +2. (1 × 6 + 3 × 2) / (1 + 3) = 12/4 = +3.
    const one = est([rec(6), ...pointAt2(10)]);
    expect([one.level, one.weightSum, one.localMedian, one.aboveMedian, one.center]).toEqual(["trip", 1, 6, 2, 3]);
    // (2) (a) = 9 × (+6), n = 9. (b) = 10 × (+2) + 9 × (+6) = 19 valores: o 10º é +2. (9 × 6 + 3 × 2) / 12 = 60/12 = +5.
    const nine = est([...Array.from({ length: 9 }, () => rec(6)), ...pointAt2(10)]);
    expect([nine.weightSum, nine.aboveMedian, nine.center]).toEqual([9, 2, 5]);
    // (3) (a) = {+6 de memória}: peso 0,5, então n = 0,5 (soma dos pesos, não a contagem).
    //     (0,5 × 6 + 3 × 2) / (0,5 + 3) = 9 / 3,5 = 2,5714…
    const memory = est([rec(6, { mode: "memory" }), ...pointAt2(10)]);
    expect(memory.weightSum).toBe(0.5);
    expect(memory.center).toBeCloseTo(9 / 3.5, 10);
    expect(memory.center).toBeCloseTo(2.57, 2);
  });

  it("sem dados na viagem, sobe de nível: (b) o ponto, encolhido para (c) o percurso; sem nada, desvio 0", () => {
    // Só registros de outra viagem no ponto: nível (b) = {+4, +4}, n = 2; acima (c) = os mesmos + {+10 na pos. 6}:
    // mediana de {4, 4, 10} = 4. Centro (2 × 4 + 3 × 4) / 5 = +4.
    const b = est([rec(4, { start: hm(9, 10) }), rec(4, { start: hm(9, 40) }), rec(10, { start: hm(9, 10), position: 6, stopId: "f-l1-6" })]);
    expect([b.level, b.center]).toEqual(["stop", 4]);
    // Só registros noutro ponto do percurso: nível (c) = {+10}, n = 1, acima (d) = 0 → (1 × 10 + 3 × 0) / 4 = +2,5.
    const c = est([rec(10, { position: 6, stopId: "f-l1-6" })]);
    expect([c.level, c.center]).toEqual(["pattern", 2.5]);
    // Registros só de sábado não entram num dia útil: nível (d).
    expect(est([rec(3, { dayType: "saturday" })]).level).toBe("none");
  });
});

describe("faixa (P-04 §3.4, T-99)", () => {
  it("T-99: 3 registros (−1, +2, +6) num ponto interpolado → de −1 − 4 = −5 a +6 + 4 = +10", () => {
    const e = est([rec(-1), rec(2), rec(6)]);
    expect([e.rangeStart, e.rangeEnd]).toEqual([-5, 10]);
    const t = exp([rec(-1), rec(2), rec(6)]);
    // 08:12 − 5 = 08:07; 08:12 + 10 = 08:22.
    expect([t.rangeStart, t.rangeEnd].map(fmt)).toEqual(["08:07", "08:22"]);
  });

  it("T-99: 10 registros → percentis 10 a 90 ponderados, sem alargar", () => {
    // Valores −2, −1, 0, 1, 2, 3, 4, 5, 6, 8, todos de peso 1. Posição do i-ésimo = (i − 0,5)/10: 0,05; 0,15; …; 0,95.
    // P10: entre 0,05 (−2) e 0,15 (−1), a meio caminho → −1,5. P90: entre 0,85 (+6) e 0,95 (+8), a meio → +7.
    const values = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 8];
    const e = est(values.map((v) => rec(v)));
    expect(e.rangeStart).toBeCloseTo(-1.5, 10);
    expect(e.rangeEnd).toBeCloseTo(7, 10);
  });

  it("quantil ponderado: pesos diferentes movem as posições", () => {
    // Valores 0 (peso 3) e 10 (peso 1): posições 1,5/4 = 0,375 e 3,5/4 = 0,875.
    // q = 0,5 → 0 + 10 × (0,5 − 0,375)/(0,875 − 0,375) = 2,5. q = 0,1 (antes da 1ª) → 0. q = 0,9 (depois da última) → 10.
    const items = [{ value: 0, weight: 3 }, { value: 10, weight: 1 }];
    expect([weightedQuantile(items, 0.5), weightedQuantile(items, 0.1), weightedQuantile(items, 0.9)]).toEqual([2.5, 0, 10]);
    // Pesos iguais: a mediana de sempre (par → média dos dois do meio).
    expect(weightedQuantile([1, 2, 3, 4].map((value) => ({ value, weight: 1 })), 0.5)).toBe(2.5);
  });
});

describe("confiança (P-04 §3.5, D-120, T-100)", () => {
  // Faixa de 3 min com 6 valores {0, 0, 1, 2, 3, 3}: posições (i − 0,5)/6 = 0,083; 0,25; …; 0,917.
  // P10 entre 0,083 (0) e 0,25 (0) = 0; P90 entre 0,75 (3) e 0,917 (3) = 3 → 3 − 0 = 3 min.
  // Com {0, 0, 1, 2, 6, 6}: P10 = 0, P90 = 6 → 6 min.
  const narrow = [0, 0, 1, 2, 3, 3];
  const wide = [0, 0, 1, 2, 6, 6];
  it("T-100: 0 → estimated; 2 → low; 4 → medium; 6 recentes com faixa 3 → high; 6 recentes com faixa 6 → medium; 6 de 70 dias → não é high", () => {
    const conf = (values: number[], daysAgo = 1) => est(values.map((v) => rec(v, { daysAgo }))).confidence;
    expect(conf([])).toBe("estimated");
    expect(conf([0, 3])).toBe("low");
    expect(conf([0, 1, 2, 3])).toBe("medium");
    expect(conf(narrow)).toBe("high");
    expect(conf(wide)).toBe("medium");
    // 70 dias > 56: nenhum é recente, mesmo com faixa de 3 min.
    expect(conf(narrow, 70)).toBe("medium");
  });

  it("a confiança conta registros, não pesos: 6 \"de memória\" recentes seguem high", () => {
    // Pesos 0,5 cada (soma 3), mas a contagem é 6 (D-120). Pesos iguais → mesma faixa de 3 min.
    expect(est(narrow.map((v) => rec(v, { daysAgo: 1, mode: "memory" }))).confidence).toBe("high");
  });

  it("conta só o nível usado: 1 registro na viagem e 10 no ponto → low", () => {
    expect(est([rec(6), ...pointAt2(10)]).confidence).toBe("low");
  });
});

describe("o que entra (D-022, D-073)", () => {
  it("D-022: orphan e ambiguous não mudam o centro (nem a faixa nem a confiança); manual entra", () => {
    const base = [rec(1), rec(2), rec(3)];
    const withOthers = [...base, rec(14, { matchStatus: "orphan" }), rec(-4, { matchStatus: "ambiguous" })];
    expect(exp(withOthers)).toEqual(exp(base));
    // Um `manual` de +6 conta como registro da viagem: (a) = {1, 2, 3, 6}, 4 registros → medium.
    expect(est([...base, rec(6, { matchStatus: "manual" })]).count).toBe(4);
  });

  it("T-20: \"vi passar\" pesa igual a \"embarquei\" (D-073)", () => {
    const boarded = [rec(5), rec(9, { daysAgo: 3 }), rec(4, { daysAgo: 10 })];
    const passed = boarded.map((r) => ({ ...r, kind: "passed" as const }));
    expect(exp(passed)).toEqual(exp(boarded));
    expect(passed.map((r) => recordWeight(r, NOW, VALID_FROM))).toEqual(boarded.map((r) => recordWeight(r, NOW, VALID_FROM)));
  });
});

describe("T-07 pelas regras do plano (Rick, 04/10: as regras do plano valem sobre o protótipo da P-04)", () => {
  it("N5 (08:12, 0), N4 (09:18, +6) e N7b (sábado, +1) → viagem das 08:10: ~08:14, faixa 08:08–08:16, esteja às 08:06, baixa", () => {
    const fact = (observedAt: number): ObservationFact => ({ stopId: ARRABALDE, lineId: P1.lineId, observedAt, observedEndAt: null, kind: "boarded", mode: "live" });
    const now = at(WED, 9, 20);
    const notes = [at(WED, 8, 12), at(WED, 9, 18), at("2026-10-03", 9, 43)];
    const records: PassageRecord[] = notes.map((observedAt) => {
      const d = deduceObservation(fact(observedAt), NETWORK);
      const c = d.candidates[0]!;
      return { deviation: d.deviation!, observedAt, serviceDate: d.serviceDate, dayType: c.dayType, tripId: d.tripId!, patternId: d.patternId!, position: d.position!, stopId: ARRABALDE, matchStatus: d.matchStatus, mode: "live", kind: "boarded" };
    });
    // As três casam auto: N5 → 08:10 (0), N4 → 09:10 (+6), N7b → sábado das 09:40 (base 09:42, +1).
    expect(records.map((r) => [r.matchStatus, r.deviation])).toEqual([["auto", 0], ["auto", 6], ["auto", 1]]);
    const e = estimateDeviation(BASE.kind, records, TARGET, now);
    // Nível (a), a viagem das 08:10 no ponto: só a N5 (a N4 é da 09:10; a N7b é de sábado, outro tipo de dia).
    // Peso da N5: 68 min de idade → 0,5^(68 / 1440 / 28) = 0,99883. Nível (b), dia útil no ponto: N5 (0) e N4 (+6, 2 min
    // de idade, peso 0,99997) → mediana ponderada = 6 × 0,99997 / (0,99883 + 0,99997) = 3,0017.
    // Centro = (0,99883 × 0 + 3 × 3,0017) / (0,99883 + 3) = 2,252 → 08:14,25 → mostra 08:14.
    expect([e.level, e.count]).toEqual(["trip", 1]);
    expect(e.aboveMedian).toBeCloseTo(3.0017, 4);
    expect(e.center).toBeCloseTo(2.252, 3);
    // Faixa: 1 registro (< 5) → de 0 a 0, ± 4 (interpolado) → 08:08 a 08:16. Esteja = 08:08 − 2 = 08:06. 1 registro → baixa.
    const t = expectedTime(BASE, records, { target: TARGET, now });
    expect([displayCenter(t.center), t.rangeStart, t.rangeEnd, displayBeAtStop(t.beAtStop)].map(fmt)).toEqual(["08:14", "08:08", "08:16", "08:06"]);
    expect(t.confidence).toBe("low");
  });
});

describe("dentro da viagem (D-070, E-03 §3.5)", () => {
  it("o último atraso da viagem hoje: o registro aceito mais tardio", () => {
    const rs = [
      { deviation: 2, observedAt: at(WED, 8, 14), matchStatus: "auto" as const },
      { deviation: 11, observedAt: at(WED, 8, 42), matchStatus: "auto" as const },
      { deviation: 30, observedAt: at(WED, 8, 50), matchStatus: "orphan" as const },
    ];
    expect(latestRideDeviation(rs)).toBe(11);
    expect(latestRideDeviation([])).toBeNull();
  });

  it("faixa do histórico deslocada para o atraso de hoje", () => {
    // Histórico na Arrabalde: (a) = {+1, +2, +3}, mediana +2, (b) igual → centro +2 = 08:14; faixa 1 − 4 a 3 + 4 = −3 a +7
    // → 08:09 a 08:19. A viagem de hoje mostrou +10: centro 08:12 + 10 = 08:22; desloca 08:22 − 08:14 = +8
    // → faixa 08:17 a 08:27 (mais larga que ±2, fica). Esteja = 08:17 − 2 = 08:15.
    const historical = exp([rec(1), rec(2), rec(3)]);
    expect([historical.center, historical.rangeStart, historical.rangeEnd].map(fmt)).toEqual(["08:14", "08:09", "08:19"]);
    const { expected, shift } = inRideExpected(BASE, historical, 10);
    expect(shift).toBe(8);
    expect([expected.center, expected.rangeStart, expected.rangeEnd, expected.beAtStop].map(fmt)).toEqual(["08:22", "08:17", "08:27", "08:15"]);
    expect([expected.confidence, expected.baseKind]).toEqual(["medium", "interpolated"]);
  });

  it("nunca mais estreita que ±2 min", () => {
    // Histórico com 6 registros de +2: P10 = P90 = +2 → faixa de largura 0 (08:14 a 08:14). Hoje +5: centro 08:17,
    // deslocada fica 08:17 a 08:17 → alargada para 08:15 a 08:19.
    const historical = exp(Array.from({ length: 6 }, () => rec(2)));
    expect([historical.rangeStart, historical.rangeEnd].map(fmt)).toEqual(["08:14", "08:14"]);
    const { expected } = inRideExpected(BASE, historical, 5);
    expect([expected.center, expected.rangeStart, expected.rangeEnd].map(fmt)).toEqual(["08:17", "08:15", "08:19"]);
  });
});

describe("faixa contém o centro (Q-80)", () => {
  it("1 registro de +6 num ponto oficial com o ponto em +2: centro +3, faixa +4 a +8 alarga para +3 a +8", () => {
    // Pos. 6 da L1 = ponto de controle (oficial, ±2). Nível (a) = {+6} na viagem das 08:10; nível (b) = 10 × (+2) + {+6}.
    // Centro (1 × 6 + 3 × 2) / 4 = +3. Faixa sem Q-80: 6 − 2 = +4 a 6 + 2 = +8 (o centro ficava fora).
    const at6 = (deviation: number, start = hm(8, 10)) => rec(deviation, { start, position: 6, stopId: "f-l1-6" });
    const records = [at6(6), ...Array.from({ length: 10 }, (_, i) => at6(2, hm(9, 10) + 30 * i))];
    const target: PassageTarget = { ...TARGET, position: 6, stopId: "f-l1-6" };
    const e = estimateDeviation("official", records, target, NOW);
    expect([e.center, e.rangeStart, e.rangeEnd]).toEqual([3, 3, 8]);
    // Base 08:20 (s + 10). Centro 08:23, faixa 08:23–08:28; "esteja no ponto" = 08:23 − 2 = 08:21 (era 08:22).
    const t = expectedTime(baseTimeAt(trip(T0810), 6)!, records, { target, now: NOW });
    expect([t.center, t.rangeStart, t.rangeEnd, t.beAtStop].map(fmt)).toEqual(["08:23", "08:23", "08:28", "08:21"]);
  });

  it("o centro já dentro da faixa não muda nada: 3 registros −1, +2, +6 → −5 a +10 (T-99)", () => {
    const e = est([rec(-1), rec(2), rec(6)]);
    expect([e.rangeStart, e.rangeEnd]).toEqual([-5, 10]);
  });
});
