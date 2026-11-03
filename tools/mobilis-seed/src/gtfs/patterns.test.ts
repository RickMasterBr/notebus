import { describe, expect, it } from "vitest";
import { alignToItinerary, analyzeRoute, serviceMinuteOf } from "./patterns.ts";
import type { GtfsFeed } from "./types.ts";

type Row = [stop: string, time: string, control?: boolean];

/** Feed inventado com uma rota "R1"; cada viagem é uma lista de [paragem, hora, controle]. */
function feedOf(trips: Record<string, Row[]>): GtfsFeed {
  return {
    info: null,
    rotas: [{ id: "R1", nomeCurto: "1" }],
    viagens: Object.keys(trips).map((id) => ({ id, rota: "R1", servico: "A-U", direcao: "0" })),
    horarios: Object.entries(trips).flatMap(([viagem, rows]) =>
      rows.map(([parada, hora, controle], i) => ({ viagem, parada, sequencia: i + 1, hora, controle: controle ?? false })),
    ),
    paradas: [],
    calendario: [],
    excecoes: [],
  };
}

const FULL: Row[] = [["A", "08:00:00", true], ["B", "08:05:00"], ["C", "08:10:00", true], ["D", "08:15:00"], ["E", "08:20:00", true]];

describe("serviceMinuteOf", () => {
  it("arredonda ao minuto mais próximo a partir dos segundos", () => {
    expect(serviceMinuteOf("06:41:34")).toBe(402);
    expect(serviceMinuteOf("06:41:29")).toBe(401);
    expect(serviceMinuteOf("06:41:30")).toBe(402);
  });
  it("passa de 1440 depois de 24:00:00", () => {
    expect(serviceMinuteOf("25:41:00")).toBe(1541);
    expect(serviceMinuteOf("24:00:00")).toBe(1440);
  });
  it("hora ilegível é null", () => {
    expect(serviceMinuteOf("8h")).toBeNull();
    expect(serviceMinuteOf("08:61:00")).toBeNull();
  });
});

describe("itinerário e alinhamento", () => {
  it("o itinerário é a maior variante", () => {
    const r = analyzeRoute(feedOf({ t1: FULL, t2: [FULL[0]!, FULL[2]!, FULL[4]!] }), "R1");
    expect(r.errors).toEqual([]);
    expect(r.itinerary).toEqual(["A", "B", "C", "D", "E"]);
    expect(r.trips).toHaveLength(2);
  });

  it("duas sequências diferentes com o tamanho máximo → ITINERARIO_EMPATADO", () => {
    const other: Row[] = [["A", "09:00:00", true], ["B", "09:05:00"], ["X", "09:10:00", true], ["D", "09:15:00"], ["E", "09:20:00", true]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: other }), "R1");
    expect(r.errors.map((e) => e.code)).toEqual(["ITINERARIO_EMPATADO"]);
    expect(r.trips).toEqual([]);
  });

  it("viagens iguais com o tamanho máximo não são empate", () => {
    const r = analyzeRoute(feedOf({ t1: FULL, t2: FULL.map(([s, , c]) => [s, "09:00:00", c] as Row) }), "R1");
    expect(r.errors).toEqual([]);
  });

  it("variante que pula uma paragem do meio: posições do alinhamento, controle certo e PARADAS_PULADAS", () => {
    const skip: Row[] = [["A", "09:00:00", true], ["B", "09:05:00"], ["D", "09:15:00"], ["E", "09:20:00", true]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: skip }), "R1");
    const t2 = r.trips.find((t) => t.tripId === "t2")!;
    expect(t2.firstPosition).toBe(1);
    expect(t2.lastPosition).toBe(5);
    expect(t2.times).toEqual([{ position: 1, serviceMinute: 540 }, { position: 5, serviceMinute: 560 }]);
    expect(r.warnings).toEqual([expect.objectContaining({ code: "PARADAS_PULADAS", items: ["R1: 1"] })]);
  });

  it("variante curta no começo e no fim alinha com firstPosition e lastPosition certos", () => {
    const mid: Row[] = [["B", "09:00:00", true], ["C", "09:05:00"], ["D", "09:10:00", true]];
    const t = analyzeRoute(feedOf({ t1: FULL, t2: mid }), "R1").trips.find((x) => x.tripId === "t2")!;
    expect([t.firstPosition, t.lastPosition]).toEqual([2, 4]);
    expect(t.times.map((x) => x.position)).toEqual([2, 4]);
  });

  it("variante que não é subsequência fica fora com VARIANTE_NAO_ALINHA", () => {
    const wrong: Row[] = [["C", "09:00:00", true], ["B", "09:05:00"], ["E", "09:10:00", true]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: wrong }), "R1");
    expect(r.trips.map((t) => t.tripId)).toEqual(["t1"]);
    expect(r.warnings).toEqual([expect.objectContaining({ code: "VARIANTE_NAO_ALINHA", items: ["t2"] })]);
  });

  it("horários só das paragens de controle, arredondados", () => {
    const rows: Row[] = [["A", "06:41:34", true], ["B", "06:45:00"], ["C", "06:50:29", true], ["D", "06:55:00"], ["E", "25:41:00", true]];
    const t = analyzeRoute(feedOf({ t1: rows }), "R1").trips[0]!;
    expect(t.times).toEqual([
      { position: 1, serviceMinute: 402 },
      { position: 3, serviceMinute: 410 },
      { position: 5, serviceMinute: 1541 },
    ]);
  });

  it("isTimepoint: posição vale se alguma viagem tem controle nela", () => {
    const other: Row[] = [["A", "09:00:00", true], ["B", "09:05:00", true], ["C", "09:10:00"], ["D", "09:15:00"], ["E", "09:20:00", true]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: other }), "R1");
    expect([...r.timepoints].sort()).toEqual([1, 2, 3, 5]);
  });

  it("viagem sem controle numa ponta fica fora com SEM_CONTROLE_NAS_PONTAS", () => {
    const bad: Row[] = [["A", "09:00:00", true], ["B", "09:05:00"], ["C", "09:10:00", true], ["D", "09:15:00"], ["E", "09:20:00"]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: bad }), "R1");
    expect(r.trips.map((t) => t.tripId)).toEqual(["t1"]);
    expect(r.warnings).toEqual([expect.objectContaining({ code: "SEM_CONTROLE_NAS_PONTAS", items: ["t2"] })]);
  });

  it("hora ilegível num controle tira a viagem com HORA_INVALIDA", () => {
    const bad: Row[] = [["A", "09:00:00", true], ["B", "09:05:00"], ["E", "meio-dia", true]];
    const r = analyzeRoute(feedOf({ t1: FULL, t2: bad }), "R1");
    expect(r.trips.map((t) => t.tripId)).toEqual(["t1"]);
    expect(r.warnings.map((w) => w.code)).toEqual(["HORA_INVALIDA"]);
  });

  it("rota sem horários → ROTA_SEM_VIAGENS", () => {
    expect(analyzeRoute(feedOf({}), "R1").errors.map((e) => e.code)).toEqual(["ROTA_SEM_VIAGENS"]);
  });

  it("circular: o mesmo ponto na primeira e na última posição, cada ocorrência na sua posição", () => {
    const circ: Row[] = [["A", "08:00:00", true], ["B", "08:05:00"], ["C", "08:10:00", true], ["A", "08:20:00", true]];
    const t = analyzeRoute(feedOf({ t1: circ }), "R1").trips[0]!;
    expect(t.times).toEqual([{ position: 1, serviceMinute: 480 }, { position: 3, serviceMinute: 490 }, { position: 4, serviceMinute: 500 }]);
    expect([t.firstPosition, t.lastPosition]).toEqual([1, 4]);
  });

  it("circular com ponto repetido no meio: a variante curta alinha pela esquerda", () => {
    const full: Row[] = [["A", "08:00:00", true], ["B", "08:05:00"], ["C", "08:10:00", true], ["B", "08:15:00"], ["A", "08:20:00", true]];
    const short: Row[] = [["B", "09:00:00", true], ["A", "09:10:00", true]];
    const t = analyzeRoute(feedOf({ t1: full, t2: short }), "R1").trips.find((x) => x.tripId === "t2")!;
    expect([t.firstPosition, t.lastPosition]).toEqual([2, 5]);
    expect(t.times.map((x) => x.position)).toEqual([2, 5]);
  });

  it("alinha da esquerda para a direita quando há paragem repetida no meio", () => {
    expect(alignToItinerary(["A", "B", "C", "B", "A"], ["B", "A"])).toEqual([2, 5]);
    expect(alignToItinerary(["A", "B", "C", "B", "A"], ["A", "B", "C", "B", "A"])).toEqual([1, 2, 3, 4, 5]);
    expect(alignToItinerary(["A", "B"], ["B", "A"])).toBeNull();
  });
});
