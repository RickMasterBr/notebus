import { describe, expect, it } from "vitest";
import {
  aheadFrom,
  baseTimeAt,
  displayBeAtStop,
  displayCenter,
  expectedTime,
  passageInfo,
  passagesAtStop,
  timepointPositions,
  type PatternData,
  type TripData,
} from "./passages.ts";
import { formatServiceMinute } from "./serviceMinute.ts";

// Exemplo inventado (D-091), com a forma da L1: circular de 51 posições que passa três vezes no "Estádio".
// Nomes, IDs e horários não são os reais.
const ESTADIO = "stop-estadio";
const ARRABALDE = "stop-arrabalde";
const CAMPUS = "stop-campus";
const TIMEPOINTS_L1 = [1, 6, 17, 25, 34, 45, 51];
const stopAt = (p: number) => (p === 1 || p === 17 || p === 51 ? ESTADIO : p === 2 ? ARRABALDE : p === 34 ? CAMPUS : `stop-${p}`);
const L1: PatternData = {
  id: "pat-l1",
  stops: Array.from({ length: 51 }, (_, i) => ({ position: i + 1, stopId: stopAt(i + 1), isTimepoint: TIMEPOINTS_L1.includes(i + 1) })),
};
const hm = (h: number, m: number) => h * 60 + m;
const trip = (id: string, times: [number, number][], first = 1, last = 51): TripData => ({
  id,
  patternId: L1.id,
  firstPosition: first,
  lastPosition: last,
  stopTimes: times.map(([position, serviceMinute]) => ({ position, serviceMinute, origin: "official" as const })),
});
const T0640 = trip("l1-0640", [[1, hm(6, 40)], [6, hm(6, 50)], [17, hm(7, 5)], [25, hm(7, 13)], [34, hm(7, 22)], [45, hm(7, 35)], [51, hm(7, 45)]]);
const T0810 = trip("l1-0810", [[1, hm(8, 10)], [6, hm(8, 20)], [17, hm(8, 32)], [25, hm(8, 37)], [34, hm(8, 44)], [45, hm(8, 55)], [51, hm(9, 5)]]);
const fmt = (m: number) => formatServiceMinute(m);

describe("horário-base (Fase 1 §4.1)", () => {
  it("T-01: L1 06:40, Arrabalde (pos. 2) → 06:42 interpolado, faixa 06:38–06:46, esteja no ponto às 06:36", () => {
    const base = baseTimeAt(T0640, 2)!;
    expect(base).toEqual({ position: 2, minute: hm(6, 42), kind: "interpolated" });
    const e = expectedTime(base, []);
    expect(e.confidence).toBe("estimated");
    expect(e.baseKind).toBe("interpolated");
    expect([e.center, e.rangeStart, e.rangeEnd, e.beAtStop].map(fmt)).toEqual(["06:42", "06:38", "06:46", "06:36"]);
  });

  it("paragem com horário oficial: o próprio horário, faixa ±2", () => {
    const base = baseTimeAt(T0810, 34)!;
    expect(base).toEqual({ position: 34, minute: hm(8, 44), kind: "official" });
    const e = expectedTime(base, []);
    expect([e.rangeStart, e.rangeEnd, e.beAtStop].map(fmt)).toEqual(["08:42", "08:46", "08:40"]);
  });

  it("horário declarado (E-08): tipo `declared`, faixa ±3", () => {
    const t: TripData = { ...T0810, stopTimes: [...T0810.stopTimes, { position: 10, serviceMinute: hm(8, 25), origin: "declared" }] };
    const e = expectedTime(baseTimeAt(t, 10)!, []);
    expect(e.baseKind).toBe("declared");
    expect([e.rangeStart, e.rangeEnd].map(fmt)).toEqual(["08:22", "08:28"]);
  });

  it("T-14: guarda os decimais (10:05 na pos. 1 e 10:08 na pos. 3 → 10:06,5 na pos. 2)", () => {
    const t = trip("t14", [[1, hm(10, 5)], [3, hm(10, 8)], [51, hm(11, 0)]]);
    expect(baseTimeAt(t, 2)!.minute).toBe(606.5);
    expect(expectedTime(baseTimeAt(t, 2)!, []).center).toBe(606.5);
  });

  it("interpola entre os horários da própria viagem quando ela não tem horário num ponto de controle", () => {
    const skips = trip("skip-6", [[1, hm(8, 0)], [17, hm(8, 16)], [51, hm(9, 0)]]);
    expect(baseTimeAt(skips, 6)).toEqual({ position: 6, minute: hm(8, 5), kind: "interpolated" });
  });

  it("viagem parcial: fora do trecho não passa", () => {
    const partial = trip("parcial", [[17, hm(9, 0)], [25, hm(9, 8)], [34, hm(9, 16)]], 17, 34);
    expect(baseTimeAt(partial, 2)).toBeNull();
    expect(baseTimeAt(partial, 51)).toBeNull();
    expect(baseTimeAt(partial, 17)!.kind).toBe("official");
    expect(baseTimeAt(partial, 20)!.minute).toBe(hm(9, 3));
  });

  it("posição no trecho sem horário antes dela: não inventa, lança erro", () => {
    const odd = trip("odd", [[6, hm(8, 0)], [51, hm(9, 0)]]);
    expect(() => baseTimeAt(odd, 2)).toThrow(/Fase 1/);
  });

  it("a margem é parâmetro (padrão 2)", () => {
    const base = baseTimeAt(T0640, 2)!;
    expect(fmt(expectedTime(base, [], { marginMinutes: 5 }).beAtStop)).toBe("06:33");
  });
});

describe("arredondamento só para mostrar (D-092)", () => {
  it("centro: minuto mais próximo, meio minuto sobe", () => {
    expect(displayCenter(606.5)).toBe(607);
    expect(displayCenter(606.49)).toBe(606);
    expect(displayCenter(606.51)).toBe(607);
    expect(displayCenter(606)).toBe(606);
  });

  it("esteja no ponto: sempre para baixo", () => {
    expect(displayBeAtStop(600.5)).toBe(600);
    expect(displayBeAtStop(600.99)).toBe(600);
    expect(displayBeAtStop(600)).toBe(600);
  });

  it("o erro de ponto flutuante da interpolação não derruba um minuto inteiro", () => {
    const almost = 401.99999999999994;
    expect(displayBeAtStop(almost)).toBe(402);
    expect(displayCenter(almost)).toBe(402);
  });

  it("T-14 de ponta a ponta: base 10:06,5 aparece 10:07; esteja às 10:00,5 aparece 10:00", () => {
    const e = expectedTime({ position: 2, minute: 606.5, kind: "interpolated" }, []);
    expect(fmt(displayCenter(e.center))).toBe("10:07");
    expect(e.beAtStop).toBe(600.5);
    expect(fmt(displayBeAtStop(e.beAtStop))).toBe("10:00");
  });
});

describe("número, origem e destino da passagem (D-094)", () => {
  const tps = timepointPositions(L1, [T0640, T0810]);

  it("T-27: Estádio nas pos. 1, 17 e 51 = 1ª, 2ª e 3ª; Arrabalde (pos. 2) uma só, sem número", () => {
    expect([1, 17, 51].map((p) => passageInfo(L1, tps, p).number)).toEqual([1, 2, 3]);
    expect(passageInfo(L1, tps, 2).number).toBeNull();
  });

  it("origem e destino são o ponto de controle anterior e o seguinte; pontas", () => {
    expect(passageInfo(L1, tps, 2)).toMatchObject({ origin: 1, destination: 6, isFirst: false, isLast: false });
    expect(passageInfo(L1, tps, 17)).toMatchObject({ origin: 6, destination: 25 });
    expect(passageInfo(L1, tps, 1)).toMatchObject({ origin: null, destination: 6, isFirst: true });
    expect(passageInfo(L1, tps, 51)).toMatchObject({ origin: 45, destination: null, isLast: true });
  });

  it("linha sem marca de controle no itinerário (como a L9): os horários da tabela fazem os pontos de controle", () => {
    const l9: PatternData = { id: "pat-l9", stops: Array.from({ length: 8 }, (_, i) => ({ position: i + 1, stopId: `l9-${i + 1}`, isTimepoint: false })) };
    const t: TripData = {
      id: "l9-0800",
      patternId: "pat-l9",
      firstPosition: 1,
      lastPosition: 8,
      stopTimes: [[1, 480], [4, 486], [8, 494]].map(([position, serviceMinute]) => ({ position: position!, serviceMinute: serviceMinute!, origin: "official" as const })),
    };
    const l9tps = timepointPositions(l9, [t]);
    expect([...l9tps].sort((a, b) => a - b)).toEqual([1, 4, 8]);
    expect(passageInfo(l9, l9tps, 6)).toMatchObject({ origin: 4, destination: 8, number: null });
  });
});

describe("passagens num ponto", () => {
  it("Estádio: três passagens por viagem, em ordem de horário; a parcial só onde chega", () => {
    const partial = trip("parcial", [[17, hm(9, 0)], [25, hm(9, 8)], [34, hm(9, 16)]], 17, 34);
    const ps = passagesAtStop(ESTADIO, [L1], [T0810, partial, T0640]);
    expect(ps.map((p) => [p.tripId, p.info.number, fmt(p.base.minute)])).toEqual([
      ["l1-0640", 1, "06:40"],
      ["l1-0640", 2, "07:05"],
      ["l1-0640", 3, "07:45"],
      ["l1-0810", 1, "08:10"],
      ["l1-0810", 2, "08:32"],
      ["parcial", 2, "09:00"],
      ["l1-0810", 3, "09:05"],
    ]);
  });

  it("velocidade: abrir um ponto de seis linhas com uma rede sintética do tamanho da MOBILIS < 50 ms", () => {
    const { patterns, trips, hub } = syntheticNetwork();
    expect(trips.length).toBe(242);
    expect(trips.reduce((n, t) => n + t.stopTimes.length, 0)).toBeGreaterThanOrEqual(1672);
    const t0 = Date.now();
    const ps = passagesAtStop(hub, patterns, trips);
    const ms = Date.now() - t0;
    expect(new Set(ps.map((p) => p.patternId)).size).toBe(6);
    expect(ms).toBeLessThan(50);
  });
});

describe("daqui para a frente (§4.3)", () => {
  const tps = timepointPositions(L1, [T0640, T0810]);

  it("do Estádio (pos. 1), viagem 08:10: Campus às 08:44 oficial, próximos pontos de controle e o ↺ volta aqui", () => {
    const r = aheadFrom(L1, tps, T0810, 1);
    expect(r.stops[0]!.info.position).toBe(2);
    expect(r.stops.at(-1)!.info.position).toBe(51);
    const campus = r.stops.find((s) => s.info.stopId === CAMPUS)!;
    expect([fmt(campus.base.minute), campus.base.kind]).toEqual(["08:44", "official"]);
    expect(r.nextTimepoints.map((s) => s.info.position)).toEqual([6, 17, 25]);
    expect(r.stops.filter((s) => s.returnsHere).map((s) => [s.info.position, s.info.number])).toEqual([[17, 2], [51, 3]]);
    expect(r.firstReturn!.info.position).toBe(17);
    expect(fmt(r.firstReturn!.base.minute)).toBe("08:32");
  });

  it("da 2ª passagem: só a 3ª volta aqui; da Arrabalde, nada volta", () => {
    expect(aheadFrom(L1, tps, T0810, 17).firstReturn!.info.position).toBe(51);
    expect(aheadFrom(L1, tps, T0810, 2).firstReturn).toBeNull();
  });

  it("para no fim do trecho da viagem parcial", () => {
    const partial = trip("parcial", [[17, hm(9, 0)], [25, hm(9, 8)], [34, hm(9, 16)]], 17, 34);
    const r = aheadFrom(L1, tps, partial, 17);
    expect(r.stops.at(-1)!.info.position).toBe(34);
    expect(r.firstReturn).toBeNull();
  });

  it("deslocamento opcional (D-070, sem uso até a E-03) soma a todos os horários", () => {
    const r = aheadFrom(L1, tps, T0810, 1, { shiftMinutes: 3 });
    const campus = r.stops.find((s) => s.info.stopId === CAMPUS)!;
    expect(fmt(campus.expected.center)).toBe("08:47");
  });
});

/**
 * Rede sintética do tamanho da MOBILIS 2026-09-01 (9 linhas, 11 percursos, 242 viagens, ~1700 horários), com um
 * ponto em 6 percursos (três vezes num deles, como o Estádio). Não são os dados reais.
 */
function syntheticNetwork(): { patterns: PatternData[]; trips: TripData[]; hub: string } {
  const hub = "stop-hub";
  const patterns: PatternData[] = [];
  const trips: TripData[] = [];
  for (let p = 0; p < 11; p++) {
    const n = 40 + (p % 4) * 3;
    const tp = [1, 7, 14, 20, 27, 34, n];
    const hubAt = p === 0 ? [1, 17, n] : p < 6 ? [10 + p] : [];
    const pattern: PatternData = {
      id: `pat-${p}`,
      stops: Array.from({ length: n }, (_, i) => ({ position: i + 1, stopId: hubAt.includes(i + 1) ? hub : `s-${p}-${i + 1}`, isTimepoint: tp.includes(i + 1) })),
    };
    patterns.push(pattern);
    const count = 22; // 11 × 22 = 242
    for (let k = 0; k < count; k++) {
      const start = 360 + k * 40 + p;
      trips.push({
        id: `trip-${p}-${k}`,
        patternId: pattern.id,
        firstPosition: 1,
        lastPosition: n,
        stopTimes: tp.map((position, j) => ({ position, serviceMinute: start + j * 9, origin: "official" as const })),
      });
    }
  }
  return { patterns, trips, hub };
}
