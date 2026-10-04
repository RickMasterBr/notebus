import { describe, expect, it } from "vitest";
import { deduceObservation, matchObservation, normalizedDistance, type ObservationFact } from "./matching.ts";
import { formatServiceMinute } from "./serviceMinute.ts";
import { ARRABALDE, CAMPUS, LOBO, NETWORK, P1, P2, P3, at, hm, tripId } from "./testing/e03Network.ts";

// Casamento (E-03 §3.3, Fase 1 §4.2) sobre a rede inventada de `testing/e03Network.ts` (D-091).
// Os casos com a MOBILIS inteira (T-11, T-12, T-16, T-17, T-18, T-19) estão no privado: `docs/dados/mobilis/`.

const WED = "2026-10-07"; // quarta, dia útil
const SAT = "2026-10-10"; // sábado

const fact = (lineId: string, stopId: string, observedAt: number, observedEndAt: number | null = null): ObservationFact => ({
  stopId,
  lineId,
  observedAt,
  observedEndAt,
  kind: "boarded",
  mode: "live",
});
const L1 = P1.lineId;
const L2 = P2.lineId;
const L3 = P3.lineId;
const fmt = formatServiceMinute;

describe("casamento do registro com a viagem (Fase 1 §4.2)", () => {
  it("T-02: L1, Arrabalde, 08:12, dia útil → a das 08:10 (base 08:12), desvio 0, auto", () => {
    // Base da viagem das 08:10 na pos. 2 = 08:10 + (08:20 − 08:10) × 1/5 = 08:12. Desvio = 08:12 − 08:12 = 0.
    // Vizinhas: a das 07:40 (base 07:42, +30) e a das 08:40 (base 08:42, −30) ficam fora de −5/+15.
    const m = matchObservation(fact(L1, ARRABALDE, at(WED, 8, 12)), NETWORK);
    expect(m.status).toBe("auto");
    expect(m.candidates).toHaveLength(1);
    const c = m.candidates[0]!;
    expect([c.tripId, fmt(c.base.minute), c.base.kind, c.deviation, c.position]).toEqual([tripId(P1, "weekday", hm(8, 10)), "08:12", "interpolated", 0, 2]);
  });

  it("T-03: L1, Arrabalde, 09:18 → a das 09:10, desvio +6, auto", () => {
    // Base 09:12; 09:18 − 09:12 = +6. A das 09:40 (base 09:42) daria −24: fora.
    const m = matchObservation(fact(L1, ARRABALDE, at(WED, 9, 18)), NETWORK);
    expect(m.status).toBe("auto");
    expect([m.candidates[0]!.tripId, m.candidates[0]!.deviation]).toEqual([tripId(P1, "weekday", hm(9, 10)), 6]);
  });

  it("T-04: L1, Arrabalde, 09:30 → orphan (−12 da das 09:40, +18 da das 09:10)", () => {
    // 09:30 − 09:42 = −12 (adiantado mais que 5); 09:30 − 09:12 = +18 (atrasado mais que 15). Nenhuma candidata.
    const m = matchObservation(fact(L1, ARRABALDE, at(WED, 9, 30)), NETWORK);
    expect(m.status).toBe("orphan");
    expect(m.candidates).toEqual([]);
    // A mais perto pela distância normalizada: +18 / 15 = 1,20 contra 12 / 5 = 2,40 → a das 09:10.
    expect([m.nearest!.tripId, m.nearest!.deviation, m.nearest!.distance]).toEqual([tripId(P1, "weekday", hm(9, 10)), 18, 1.2]);
  });

  it("T-05: L2, Campus, intervalo 13:28–13:30 → casa pelo ponto médio 13:29 com a das 13:30, desvio −1", () => {
    // Viagem das 12:50: Campus (controle) às 12:50 + 40 = 13:30. Ponto médio (13:28 + 13:30) / 2 = 13:29 → −1.
    const m = matchObservation(fact(L2, CAMPUS, at(WED, 13, 28), at(WED, 13, 30)), NETWORK);
    expect(m.status).toBe("auto");
    const c = m.candidates[0]!;
    expect([fmt(c.base.minute), c.base.kind, c.deviation]).toEqual(["13:30", "official", -1]);
  });

  it("T-06: L2, F. R. Lobo (pos. 23), sábado 12:30 → base 12:33 interpolada, desvio −3, auto", () => {
    // Sábado das 11:50: Campus 12:30, pos. 25 às 12:36 → pos. 23 = 12:30 + 6 × 2/4 = 12:33. 12:30 − 12:33 = −3.
    // As de dia útil não circulam no sábado; a das 12:50 de sábado (base 13:33) daria −63.
    const m = matchObservation(fact(L2, LOBO, at(SAT, 12, 30)), NETWORK);
    expect(m.status).toBe("auto");
    const c = m.candidates[0]!;
    expect([c.tripId, fmt(c.base.minute), c.base.kind, c.deviation, c.dayType]).toEqual([tripId(P2, "saturday", hm(11, 50)), "12:33", "interpolated", -3, "saturday"]);
  });

  it("T-13: L2, Campus, 14:48 → orphan; o mais perto pela distância normalizada é a das 13:50 (1,20 × 2,40)", () => {
    // A das 13:50 passa no Campus às 14:30 → +18 → 18/15 = 1,20. A das 14:20 às 15:00 → −12 → 12/5 = 2,40.
    const m = matchObservation(fact(L2, CAMPUS, at(WED, 14, 48)), NETWORK);
    expect(m.status).toBe("orphan");
    expect([m.nearest!.tripId, m.nearest!.distance]).toEqual([tripId(P2, "weekday", hm(13, 50)), 1.2]);
    expect(normalizedDistance(-12)).toBe(2.4);
  });

  it("T-14: L3, Arrabalde (pos. 2 desta rede), 10:08 → a L3 das 10:05, base 10:06,5, desvio +1,5, auto", () => {
    // 10:05 + (10:08 − 10:05) × 1/2 = 10:06,5 (minuto com decimais); 10:08 − 10:06,5 = +1,5. A L1 passa no mesmo
    // ponto físico, mas o casamento só olha a linha do registro.
    const m = matchObservation(fact(L3, ARRABALDE, at(WED, 10, 8)), NETWORK);
    expect(m.status).toBe("auto");
    const c = m.candidates[0]!;
    expect([c.tripId, c.base.minute, c.deviation]).toEqual([tripId(P3, "weekday", hm(10, 5)), hm(10, 6) + 0.5, 1.5]);
  });

  it("T-15: L2, Campus, 13:25 (chegada) e 13:30 (saída) → as duas com a das 12:50: −5 e 0", () => {
    // Base 13:30 (controle). 13:25 − 13:30 = −5 (no limite, entra); 13:30 − 13:30 = 0. A das 12:20 (13:00) daria +25 e +30.
    const a = matchObservation(fact(L2, CAMPUS, at(WED, 13, 25)), NETWORK);
    const b = matchObservation(fact(L2, CAMPUS, at(WED, 13, 30)), NETWORK);
    const t1250 = tripId(P2, "weekday", hm(12, 50));
    expect([a.status, a.candidates[0]!.tripId, a.candidates[0]!.deviation]).toEqual(["auto", t1250, -5]);
    expect([b.status, b.candidates[0]!.tripId, b.candidates[0]!.deviation]).toEqual(["auto", t1250, 0]);
  });

  it("janela: −5 e +15 entram; −5,5 e +15,5 não", () => {
    // Viagem das 08:10, base 08:12 na Arrabalde.
    // 08:07:00 → −5 (entra). 08:06:30 → −5,5 (fora; a das 07:40 daria +24,5) → orphan.
    // 08:27:00 → +15 (entra; a das 08:40, base 08:42, daria −15). 08:27:30 → +15,5 e −14,5 → orphan.
    const status = (h: number, m: number, s: number) => matchObservation(fact(L1, ARRABALDE, at(WED, h, m, s)), NETWORK);
    const in1 = status(8, 7, 0);
    const out1 = status(8, 6, 30);
    const in2 = status(8, 27, 0);
    const out2 = status(8, 27, 30);
    expect([in1.status, in1.candidates[0]!.deviation]).toEqual(["auto", -5]);
    expect([out1.status, out1.nearest!.deviation]).toEqual(["orphan", -5.5]);
    expect([in2.status, in2.candidates[0]!.deviation]).toEqual(["auto", 15]);
    expect([out2.status, out2.nearest!.deviation]).toEqual(["orphan", 15.5]);
  });

  it("virada da meia-noite: 00:12 de quinta casa com a \"00:10\" (24:10) do dia de serviço de quarta (D-016)", () => {
    // A viagem das 24:10 de quarta passa na Arrabalde às 24:12. Quinta 00:12 = minuto 12 de quinta = 24:12 de quarta.
    const d = deduceObservation(fact(L1, ARRABALDE, at("2026-10-08", 0, 12)), NETWORK);
    expect([d.matchStatus, d.serviceDate, d.serviceMinute, d.deviation, d.tripId]).toEqual(["auto", WED, hm(24, 12), 0, tripId(P1, "weekday", hm(24, 10))]);
  });

  it("os segundos entram no atraso: 08:12:30 → +0,5", () => {
    const m = matchObservation(fact(L1, ARRABALDE, at(WED, 8, 12, 30)), NETWORK);
    expect(m.candidates[0]!.deviation).toBe(0.5);
  });

  it("D-071: com uma viagem em curso da mesma linha, só as passagens dessa viagem contam", () => {
    // 09:30 sozinha é órfã (T-04). Com a das 09:40 em curso, a única passagem avaliada é a dela (−12): continua órfã,
    // e a das 09:10 (+18, a mais perto quando sozinha) nem é avaliada.
    const t0940 = tripId(P1, "weekday", hm(9, 40));
    const inRide = matchObservation(fact(L1, ARRABALDE, at(WED, 9, 30)), NETWORK, { lineId: L1, tripId: t0940, serviceDate: WED });
    expect([inRide.status, inRide.nearest!.tripId, inRide.nearest!.deviation]).toEqual(["orphan", t0940, -12]);
    // Viagem em curso de outra linha não restringe nada.
    const other = matchObservation(fact(L1, ARRABALDE, at(WED, 8, 12)), NETWORK, { lineId: L2, tripId: tripId(P2, "weekday", hm(7, 50)), serviceDate: WED });
    expect([other.status, other.candidates[0]!.tripId]).toEqual(["auto", tripId(P1, "weekday", hm(8, 10))]);
  });
});

describe("dedução refazível (E-03 §3.2, T-22, parte do domínio)", () => {
  it("T-22: deduzir duas vezes o mesmo fato dá o mesmo resultado, sem mexer na entrada", () => {
    const f = Object.freeze(fact(L1, ARRABALDE, at(WED, 9, 18)));
    const first = deduceObservation(f, NETWORK);
    const again = deduceObservation(f, NETWORK);
    expect(again).toEqual(first);
    // T-03: dia e minuto de serviço, passagem, viagem, atraso e status.
    expect([first.serviceDate, first.serviceMinute, first.tripId, first.patternId, first.position, first.deviation, first.matchStatus]).toEqual([
      WED, hm(9, 18), tripId(P1, "weekday", hm(9, 10)), P1.id, 2, 6, "auto",
    ]);
    expect(f).toEqual(fact(L1, ARRABALDE, at(WED, 9, 18)));
  });

  it("órfã: sem viagem nem atraso; dia e minuto de serviço do relógio de hoje", () => {
    const d = deduceObservation(fact(L1, ARRABALDE, at(WED, 9, 30)), NETWORK);
    expect([d.matchStatus, d.serviceDate, d.serviceMinute, d.tripId, d.deviation]).toEqual(["orphan", WED, hm(9, 30), null, null]);
  });
});
