import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "./config.ts";
import { busCandidates, gotoCards, shrunkRideMinutes, walkTimes, type BusCandidate, type BusOption, type GotoInput, type WalkOption } from "./goto.ts";
import type { PassageRecord, TripData } from "./passages.ts";
import { formatServiceMinute } from "./serviceMinute.ts";
import { ARRABALDE, LOBO, P1, P2, P3, TRIPS as ALL_TRIPS, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// "Ir para X" (E-05 §3, §6) sobre a rede inventada de `testing/e03Network.ts` (D-091). Cada valor esperado tem a
// conta ao lado. Os horários devolvidos são minutos de serviço inteiros.

const WED = "2026-10-07"; // quarta-feira, dia útil
const fmt = (m: number) => formatServiceMinute(m);
const walkNone = { min: 0, max: null };
/** Só as viagens de dia útil: é o que `tripsRunningOn` entregaria numa quarta-feira. */
const TRIPS = ALL_TRIPS.filter((t) => t.id.includes("/weekday/"));
/** 07:50: a L1 das 08:10 é a primeira viável (a das 07:40 já saiu), para os testes que olham essa viagem. */
const EARLY = at(WED, 7, 50);

function input(over: Partial<GotoInput> & Pick<GotoInput, "busOptions">): GotoInput {
  return {
    walk: null,
    trips: TRIPS,
    records: [],
    now: at(WED, 7, 0),
    serviceDate: WED,
    dayType: "weekday",
    validFrom: () => VALID_FROM,
    ...over,
  };
}

/** Um registro aceito da L1 (dia útil, hoje 07:00): a conta nas passagens fica sem efeito de recência (idade 0 ≈ igual). */
function rec(p: { pattern: typeof P1; start: number; position: number; stopId: string; deviation: number }): PassageRecord {
  return {
    deviation: p.deviation,
    observedAt: at(WED, 7, 0),
    serviceDate: WED,
    dayType: "weekday",
    tripId: tripId(p.pattern, "weekday", p.start),
    patternId: p.pattern.id,
    position: p.position,
    stopId: p.stopId,
    matchStatus: "auto",
    mode: "live",
    kind: "boarded",
  };
}

/** Casa → Faculdade pela L1: embarca na Arrabalde (pos. 2), desce na pos. 10; 8 min a pé até o embarque, 5 depois. */
const CASA_FACUL: BusOption = {
  id: "casa-facul-l1",
  pattern: P1,
  boardPosition: 2,
  alightPosition: 10,
  walkToBoard: { min: 8, max: null },
  walkAfterAlight: { min: 5, max: null },
  rideMinutes: [],
};
// Registros inventados na Arrabalde da viagem das 08:10 (base 08:12): +0, +2 e +4 → mediana +2, faixa −4…+8.
const L1_RECORDS = [0, 2, 4].map((deviation) => rec({ pattern: P1, start: hm(8, 10), position: 2, stopId: ARRABALDE, deviation }));
const first = (cs: BusCandidate[]) => cs[0]!;

describe("B1, T-45: tempo a pé com faixa (D-100)", () => {
  it("T-45: 10 a 12 → sair/até usam 12, chega usa 11; sem faixa, o próprio número", () => {
    expect(walkTimes({ min: 10, max: 12 })).toEqual({ leave: 12, mid: 11, until: 12 });
    expect(walkTimes({ min: 8, max: null })).toEqual({ leave: 8, mid: 8, until: 8 });
  });

  it("T-45: nas duas pontas, o candidato usa 12 para sair, 11 para chegar e 12 para o até", () => {
    const wide: BusOption = { ...CASA_FACUL, walkToBoard: { min: 10, max: 12 }, walkAfterAlight: { min: 10, max: 12 } };
    const narrow: BusOption = { ...CASA_FACUL, walkToBoard: { min: 12, max: null }, walkAfterAlight: { min: 11, max: null } };
    const c = first(busCandidates(wide, input({ busOptions: [wide], now: EARLY })));
    // Viagem 08:10: Arrabalde 08:12 (±4): esteja às 08:06. Sair = 08:06 − 12 = 07:54 (com 8 seria 07:58).
    expect(fmt(c.leaveAt)).toBe("07:54");
    // Descida (pos. 10): 08:30 (oficial ±2). Chega = 08:30 + 11 = 08:41; até = 08:32 + 12 = 08:44.
    expect([fmt(c.arriveAt), fmt(c.until)]).toEqual(["08:41", "08:44"]);
    // Uma faixa 10–12 chega igual a um número só de 11 na chegada; no "sair" e no "até" vale o 12.
    const n = first(busCandidates(narrow, input({ busOptions: [narrow], now: EARLY })));
    expect(n.arriveAt).toBe(c.arriveAt);
    expect([n.leaveAt, n.until]).toEqual([c.leaveAt, c.until - 1]); // 11 em vez de 12 nas duas contas
  });
});

describe("T-07: Casa → Faculdade pela L1, dia útil, viagem das 08:10", () => {
  const c = first(busCandidates(CASA_FACUL, input({ busOptions: [CASA_FACUL], records: L1_RECORDS, now: EARLY })));

  it("esteja às 08:06, sair às 07:58 (8 min a pé), chega ~08:36, até 08:41", () => {
    // Arrabalde: base 08:12, mediana +2 → 08:14; faixa 08:08–08:20 (menor desvio 0 − 4; maior 4 + 4); esteja às 08:08 − 2 = 08:06.
    expect(fmt(c.beAtStop)).toBe("08:06");
    // Sair às = 08:06 − 8 = 07:58 (o plano dizia 07:59; a conta da E-03 com a faixa 08:08 dá 07:58).
    expect(fmt(c.leaveAt)).toBe("07:58");
    // Descida pos. 10: base 08:30, sem registro ali: nível percurso, n = 3, mediana +2: (3·2 + 3·0)/6 = +1 → 08:31.
    // Faixa (menos de 5 registros): do menor ao maior desvio do nível, 0 e +4, mais a incerteza oficial ±2 → fim 08:36.
    // Chega = 08:31 + 5 = 08:36; até = 08:36 + 5 = 08:41.
    expect([fmt(c.arriveAt), fmt(c.until)]).toEqual(["08:36", "08:41"]);
    expect(c.usedRideTimes).toBe(false);
  });
});

describe("T-21: L2, embarque numa paragem da linha, descida na F. R. Lobo (\"Castelo\"), com registros", () => {
  const L2_OPTION: BusOption = {
    id: "academia-castelo-l2",
    pattern: P2,
    boardPosition: 8, // "academia": 14:50 + 40·(7/20) = 15:04, interpolado
    alightPosition: 23, // LOBO: 14:50 + 40 + 6·(2/4) = 15:33, interpolado
    walkToBoard: { min: 4, max: null },
    walkAfterAlight: { min: 10, max: 12 },
    rideMinutes: [],
  };
  const T1450 = hm(14, 50);
  const records = [5, 4, 0].map((deviation) => rec({ pattern: P2, start: T1450, position: 8, stopId: "f-l2-8", deviation }))
    .concat(rec({ pattern: P2, start: T1450, position: 23, stopId: LOBO, deviation: 8 }));
  const trips = TRIPS.filter((t) => t.id === tripId(P2, "weekday", T1450));

  it("o embarque e o Castelo, com a regra da E-03 (centro encolhido, faixa mais a incerteza da base)", () => {
    const [c] = busCandidates(L2_OPTION, input({ busOptions: [L2_OPTION], trips, records, now: at(WED, 7, 0) }));
    // Embarque: base 15:04 (±4), nível viagem {5, 4, 0}: mediana 4, acima (ponto) a mesma → centro +4 = 15:08;
    // faixa 15:00 (0 − 4) a 15:13 (5 + 4 = +9); esteja às 15:00 − 2 = 14:58; sair = 14:58 − 4 = 14:54.
    expect([fmt(c!.beAtStop), fmt(c!.leaveAt)]).toEqual(["14:58", "14:54"]);
    // Descida: base 15:33 (±4), 1 registro de +8, nível viagem n = 1; acima (ponto) {8}: centro +8 = 15:41; faixa 15:37–15:45.
    // Chega = 15:41 + 11 = 15:52; até = 15:45 + 12 = 15:57.
    expect([fmt(c!.arriveAt), fmt(c!.until)]).toEqual(["15:52", "15:57"]);
  });
});

describe("B2: sair às já passou", () => {
  const cardsAt = (h: number, m: number) =>
    busCandidates(CASA_FACUL, input({ busOptions: [CASA_FACUL], records: L1_RECORDS, now: at(WED, h, m) })).map((c) => fmt(c.leaveAt));
  const T0810_LEAVE = "07:58";

  it("T-49 (parte pura): 07:57 e 07:58 mantêm a L1 das 08:10; 07:59 a tira e a próxima sobe", () => {
    // `sair às` da 08:10 = 07:58; comparado ao minuto de `now`: igual fica, menor sai.
    expect(cardsAt(7, 57)[0]).toBe(T0810_LEAVE);
    expect(cardsAt(7, 58)[0]).toBe(T0810_LEAVE); // igual: fica
    const after = cardsAt(7, 59);
    expect(after[0]).not.toBe(T0810_LEAVE); // 07:58 < 07:59: sai
    expect(after).toHaveLength(DOMAIN_CONFIG.tripsPerOption); // a das 08:40 sobe e entra a das 09:10
  });

  it("T-49 (parte pura): às 08:00 a pé (50 min) fica acima da L1 das 08:40 e o cartão das 08:10 já saiu", () => {
    const cards = gotoCards(input({ busOptions: [CASA_FACUL], records: L1_RECORDS, walk: walk(50), now: at(WED, 8, 0) }));
    // L1 08:40: Arrabalde 08:42, pos. 10 às 09:00 (+1 do nível percurso = 09:01), +5 a pé = 09:06. A pé: 08:50 → vence por 16 ≥ 15.
    expect(cards.map((c) => (c.kind === "walk" ? "a pé" : fmt(c.leaveAt)))).toEqual(["a pé", "08:28", "08:58"]);
  });

  it("segundos do relógio não contam: 07:58:59 ainda é o minuto 07:58", () => {
    const list = busCandidates(CASA_FACUL, input({ busOptions: [CASA_FACUL], records: L1_RECORDS, now: at(WED, 7, 58, 59) }));
    expect(fmt(first(list).leaveAt)).toBe(T0810_LEAVE);
  });
});

describe("B3, T-46: tempo real de trecho (Fase 1 §4.5 passo 2)", () => {
  it("T-46: oficial 20, deslocamentos 24 e 26 → (2·25 + 3·20)/5 = 22; n = 1 e n = 0", () => {
    expect(shrunkRideMinutes([24, 26], 20)).toBe(22);
    expect(shrunkRideMinutes([24], 20)).toBe(21); // (1·24 + 3·20)/4 = 21
    expect(shrunkRideMinutes([], 20)).toBeNull(); // n = 0: quem chama usa a descida esperada
    expect(shrunkRideMinutes([30, 24, 26, 28], 20)).toBeCloseTo((4 * 27 + 60) / 7, 10); // número par: média dos do meio
  });

  it("T-46: a L3 (oficial 3 min, 08:05 → pos. 3 às 08:08) com deslocamentos usa o tempo do trecho; `até` pela proposta D-174", () => {
    const l3: BusOption = { id: "l3", pattern: P3, boardPosition: 1, alightPosition: 3, walkToBoard: walkNone, walkAfterAlight: { min: 6, max: 8 }, rideMinutes: [] };
    const trips = TRIPS.filter((t) => t.id === tripId(P3, "weekday", hm(8, 5)));
    const run = (o: BusOption) => first(busCandidates(o, input({ busOptions: [o], trips })));
    // n = 0: descida esperada 08:08 (centro) e fim 08:10; chega = 08:08 + 7 = 08:15; até = 08:10 + 8 = 08:18.
    const none = run(l3);
    expect([fmt(none.arriveAt), fmt(none.until), none.usedRideTimes]).toEqual(["08:15", "08:18", false]);
    // n = 2 (7 e 9 min; mediana 8): trecho = (2·8 + 3·3)/5 = 5. Embarque 08:05 (centro), fim da faixa 08:07.
    // chega = 08:05 + 5 + 7 = 08:17; até (D-174) = 08:07 + 5 + 8 = 08:20.
    const two = run({ ...l3, rideMinutes: [7, 9] });
    expect([fmt(two.arriveAt), fmt(two.until), two.usedRideTimes]).toEqual(["08:17", "08:20", true]);
    // n = 1 (10 min): (1·10 + 3·3)/4 = 4,75 → chega = 08:05 + 4,75 + 7 = 08:16,75 → 08:17.
    const one = run({ ...l3, rideMinutes: [10] });
    expect(fmt(one.arriveAt)).toBe("08:17");
  });

  it("item 0: trecho com deslocamentos usa o tempo oficial da tabela, não a diferença dos centros esperados", () => {
    // Tabela: P1 pos 1 (08:10) até pos 10 (08:30) = 20 min oficial.
    // Registro de +8 só na descida (pos 10).
    const option: BusOption = {
      id: "oficial-trecho",
      pattern: P1,
      boardPosition: 1,
      alightPosition: 10,
      walkToBoard: walkNone,
      walkAfterAlight: { min: 5, max: null },
      rideMinutes: [24, 26],
    };
    const T0810 = hm(8, 10);
    const trips = TRIPS.filter((t) => t.id === tripId(P1, "weekday", T0810));
    const alightStopId = P1.stops.find((s) => s.position === 10)!.stopId;
    const records = [rec({ pattern: P1, start: T0810, position: 10, stopId: alightStopId, deviation: 8 })];
    const [c] = busCandidates(option, input({ busOptions: [option], trips, records, now: EARLY }));
    // Oficial da tabela = 20 min. Mediana de [24, 26] = 25.
    // Trecho encolhido = (2·25 + 3·20)/5 = 22 min.
    // Embarque: base 08:10, 1 registro na viagem (+8) encolhido com k=3 → centro = 08:12 (492 min).
    // Chega = centro no embarque (08:12) + 22 + 5 = 08:39.
    // Com o bug (alight.center - board.center = 26), o trecho dava 25,6 e a chegada dava 08:43.
    expect(fmt(c!.arriveAt)).toBe("08:39");
  });
});

describe("B2: limites e recusas", () => {
  it("devolve no máximo `tripsPerOption` (2) viagens, as próximas", () => {
    const list = busCandidates(CASA_FACUL, input({ busOptions: [CASA_FACUL] }));
    expect(list).toHaveLength(DOMAIN_CONFIG.tripsPerOption);
    // Base na Arrabalde = partida + 2; faixa ±4; esteja = base − 4 − 2 = partida − 4; sair = esteja − 8 = partida − 12.
    // Agora 07:00: a das 07:10 sai às 06:58 (já passou), a das 06:40 também; as viáveis são 07:40 (sair 07:28) e 08:10.
    expect(list.map((c) => fmt(c.beAtStop))).toEqual(["07:36", "08:06"]);
  });

  it("descida antes (ou na mesma posição) do embarque é recusada", () => {
    expect(() => busCandidates({ ...CASA_FACUL, boardPosition: 10, alightPosition: 2 }, input({ busOptions: [] }))).toThrow(/depois do embarque/);
    expect(() => busCandidates({ ...CASA_FACUL, alightPosition: 2 }, input({ busOptions: [] }))).toThrow(/depois do embarque/);
  });

  it("viagem parcial que não chega à descida fica de fora", () => {
    const partial: TripData = { id: "parcial", patternId: P1.id, firstPosition: 1, lastPosition: 6, stopTimes: [{ position: 1, serviceMinute: hm(8, 0), origin: "official" }, { position: 6, serviceMinute: hm(8, 10), origin: "official" }] };
    const list = busCandidates(CASA_FACUL, input({ busOptions: [CASA_FACUL], trips: [partial] }));
    expect(list).toEqual([]);
  });
});

// ─── B4 e B5: ordem e corte ─────────────────────────────────────────────────

/** Uma opção de ônibus com uma única viagem inventada: embarque às `board` (oficial), descida às `alight`, sem caminhada. */
function oneTrip(id: string, board: number, alight: number): { option: BusOption; trip: TripData } {
  const pattern = { id: `pat-${id}`, stops: [{ position: 1, stopId: `${id}-a`, isTimepoint: true }, { position: 2, stopId: `${id}-b`, isTimepoint: true }] };
  const trip: TripData = {
    id: `trip-${id}`,
    patternId: pattern.id,
    firstPosition: 1,
    lastPosition: 2,
    stopTimes: [{ position: 1, serviceMinute: board, origin: "official" }, { position: 2, serviceMinute: alight, origin: "official" }],
  };
  return { option: { id, pattern, boardPosition: 1, alightPosition: 2, walkToBoard: walkNone, walkAfterAlight: walkNone, rideMinutes: [] }, trip };
}
const ids = (cards: { optionId: string }[]) => cards.map((c) => c.optionId);
const walk = (minutes: number): WalkOption => ({ id: "a-pe", walkMinutes: minutes });

describe("B4, T-43, T-44: ordenação (D-034)", () => {
  it("T-43: agora 08:00; L9 chega 08:54; a pé 08:50; L1 das 08:40 chega 09:15 → L9, a pé, L1", () => {
    const l9 = oneTrip("l9", hm(8, 20), hm(8, 54));
    const l1 = oneTrip("l1", hm(8, 40), hm(9, 15));
    const cards = gotoCards(input({ busOptions: [l1.option, l9.option], trips: [l1.trip, l9.trip], walk: walk(50), now: at(WED, 8, 0) }));
    expect(ids(cards)).toEqual(["l9", "a-pe", "l1"]); // a pé vence a L9 por 4 min (< 15), vence a L1 por 25
  });

  it("T-44: empate às 08:45 → a L1 acima da a pé (agora 07:55, a pé 50 min)", () => {
    const l1 = oneTrip("l1", hm(8, 20), hm(8, 45));
    const cards = gotoCards(input({ busOptions: [l1.option], trips: [l1.trip], walk: walk(50), now: at(WED, 7, 55) }));
    expect(ids(cards)).toEqual(["l1", "a-pe"]);
  });

  it("T-44: a pé 15 min antes do ônibus fica acima (limite inclusive); com 14 min fica abaixo", () => {
    const at15 = oneTrip("l1", hm(8, 20), hm(9, 5)); // a pé chega 08:50; 09:05 − 08:50 = 15
    const at14 = oneTrip("l1", hm(8, 20), hm(9, 4)); // 14
    const now = at(WED, 8, 0);
    expect(ids(gotoCards(input({ busOptions: [at15.option], trips: [at15.trip], walk: walk(50), now })))).toEqual(["a-pe", "l1"]);
    expect(ids(gotoCards(input({ busOptions: [at14.option], trips: [at14.trip], walk: walk(50), now })))).toEqual(["l1", "a-pe"]);
  });

  it("no empate de chegada entre ônibus, vence quem deixa sair mais tarde", () => {
    const early = oneTrip("cedo", hm(8, 10), hm(8, 45));
    const late = oneTrip("tarde", hm(8, 25), hm(8, 45));
    const cards = gotoCards(input({ busOptions: [early.option, late.option], trips: [early.trip, late.trip], now: at(WED, 7, 0) }));
    expect(ids(cards)).toEqual(["tarde", "cedo"]);
  });

  it("a pé: `sair agora`, chega e até = agora + minutos", () => {
    const l1 = oneTrip("l1", hm(8, 40), hm(9, 15));
    const w = gotoCards(input({ busOptions: [l1.option], trips: [l1.trip], walk: walk(50), now: at(WED, 8, 0) })).find((c) => c.kind === "walk")!;
    expect([fmt(w.leaveAt), fmt(w.arriveAt), fmt(w.until)]).toEqual(["08:00", "08:50", "08:50"]);
  });

});

describe("B5: corte em `maxCards` (6)", () => {
  it("corta ônibus do fim; o cartão a pé sobrevive mesmo quando ficaria em 7º", () => {
    const options = Array.from({ length: 8 }, (_, i) => oneTrip(`b${i}`, hm(8, 10) + i, hm(8, 30) + i));
    const base = { busOptions: options.map((o) => o.option), trips: options.map((o) => o.trip), now: at(WED, 7, 0) };
    // A pé chega 07:00 + 100 = 08:40: não vence ninguém por 15 min (ônibus chegam 08:30…08:37) → vai para o fim.
    const cards = gotoCards(input({ ...base, walk: walk(100) }));
    expect(cards).toHaveLength(DOMAIN_CONFIG.maxCards);
    expect(ids(cards)).toEqual(["b0", "b1", "b2", "b3", "b4", "a-pe"]);
    // Sem a pé, os 6 são ônibus.
    expect(ids(gotoCards(input(base)))).toEqual(["b0", "b1", "b2", "b3", "b4", "b5"]);
  });

  it("2 viagens por opção: 4 opções de 3 viagens dão 8 candidatos e a lista corta em 6", () => {
    const opt: BusOption = CASA_FACUL;
    const cards = gotoCards(input({ busOptions: [opt, { ...opt, id: "outra" }, { ...opt, id: "mais" }, { ...opt, id: "ainda" }] }));
    expect(cards).toHaveLength(DOMAIN_CONFIG.maxCards);
  });

  it("lista vazia é resposta válida (sem viagens, sem a pé)", () => {
    expect(gotoCards(input({ busOptions: [CASA_FACUL], trips: [] }))).toEqual([]);
  });
});
