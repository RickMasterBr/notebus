/// <reference types="node" />
// Dados inventados (D-091). Ver `db/testing/lineSeed.ts`. Horários de serviço: 08:10 = 490, 08:44 = 524, 09:00 = 540.
import { type PassageRecord, type SeedFile, baseTimeAt, displayCenter, expectedTime } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { type LineSpec, lineSeed } from "../db/testing/lineSeed";
import { type Ahead, buildAhead, timelineItems } from "./ahead";
import { boldSegments, contextText, returnTag, stopA11y, stopTimeText, summaryPlain, summaryText } from "./aheadText";
import { aheadServiceDay } from "./learnedPassages";
import { passageTarget } from "./records";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";
import { clockText } from "./stopCard";
import { buildStopDay } from "./stopDay";
import { learnedFixture, learnedTripIdOf } from "./learnedFixture";
import { lisbon } from "./registroFixture";

async function load(seed: SeedFile): Promise<ScheduleSnapshot> {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, seed);
  return loadSchedule(db);
}

const NAMES = {
  estadio: "Estádio Inventado",
  arrabalde: "Arrabalde Fictício",
  camara: "Câmara Exemplo",
  campus: "Campus Exemplo",
  hospital: "Hospital Fictício",
  a1: "Rua A",
  a2: "Rua B",
  a3: "Rua C",
  shopping: "Shopping Exemplo",
  b1: "Rua D",
  terminal: "Terminal Exemplo",
};

// Linha 1: sai do Estádio, que repete nas posições 1, 6 e 12 (T-27); termina no Terminal. 08:10 → 10:10.
//  1 Estádio* 2 Arrabalde 3 Câmara 4 Campus* 5 Hospital 6 Estádio* 7 A 8 B 9 C 10 Shopping* 11 D 12 Estádio* 13 Terminal*
const LINES: LineSpec[] = [
  {
    code: "1",
    color: "#7CB342",
    stops: [
      { stop: "estadio", timepoint: true }, { stop: "arrabalde" }, { stop: "camara" }, { stop: "campus", timepoint: true },
      { stop: "hospital" }, { stop: "estadio", timepoint: true }, { stop: "a1" }, { stop: "a2" }, { stop: "a3" },
      { stop: "shopping", timepoint: true }, { stop: "b1" }, { stop: "estadio", timepoint: true }, { stop: "terminal", timepoint: true },
    ],
    trips: [
      { id: "0810", days: ["weekday"], times: { 1: 490, 4: 524, 6: 540, 10: 570, 12: 600, 13: 610 } },
      // Viagem parcial: só do Campus ao Shopping.
      { id: "0900", days: ["weekday"], first: 4, last: 10, times: { 4: 540, 10: 586 } },
    ],
  },
];

const seed = lineSeed(NAMES, LINES);
const tripId = (id: string) => seed.trips.find((t) => t.key.endsWith(`/L1/${id}`))!.id;
let snapshot: ScheduleSnapshot;
async function ahead(trip: string, position: number, options?: Parameters<typeof buildAhead>[3]): Promise<Ahead> {
  snapshot ??= await load(seed);
  const result = buildAhead(tripId(trip), position, snapshot, options);
  expect(result).not.toBeNull();
  return result!;
}
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("buildAhead: o A4 do plano (viagem das 08:10, do Estádio)", () => {
  it("1ª passagem: o Campus às 08:44 (oficial), os 3 próximos pontos de controle e a primeira volta", async () => {
    const a = await ahead("0810", 1);
    expect(a.tripStart).toBe("08:10");
    expect(a.here).toMatchObject({ position: 1, name: "Estádio Inventado", time: "08:10", number: 1, kind: "official" });
    expect(a.isFirst).toBe(true);
    expect(a.isLast).toBe(false);
    expect(a.stops.map((s) => s.position)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const campus = a.stops.find((s) => s.position === 4)!;
    expect(campus).toMatchObject({ name: "Campus Exemplo", time: "08:44", kind: "official", isTimepoint: true });
    expect(stopTimeText(campus)).toBe("08:44");
    expect(a.nextTimepoints).toEqual([
      { name: "Campus Exemplo", time: "08:44" },
      { name: "Estádio Inventado", time: "09:00" },
      { name: "Shopping Exemplo", time: "09:30" },
    ]);
    expect(a.firstReturn).toEqual({ name: "Estádio Inventado", time: "09:00" });
    // "volta aqui" nas duas outras passagens do Estádio, com o número (T-27); a última da viagem é o Terminal.
    expect(a.stops.filter((s) => s.returnsHere).map((s) => [s.position, s.number])).toEqual([[6, 2], [12, 3]]);
    expect(a.stops.filter((s) => s.isLast).map((s) => s.position)).toEqual([13]);
  });

  it("interpolada pela contagem de paragens, com til: Arrabalde 08:21 e Câmara 08:33", async () => {
    const a = await ahead("0810", 1);
    const [arrabalde, camara] = a.stops;
    expect([arrabalde!.time, arrabalde!.kind, stopTimeText(arrabalde!)]).toEqual(["08:21", "interpolated", "~08:21"]);
    expect([camara!.time, stopTimeText(camara!)]).toEqual(["08:33", "~08:33"]);
    expect(arrabalde!.rangeStart < arrabalde!.time && arrabalde!.time < arrabalde!.rangeEnd).toBe(true);
  });

  it("2ª passagem (posição 6): volta aqui na 3ª passagem, que não é a última; 'você' é a 2ª", async () => {
    const a = await ahead("0810", 6);
    expect(a.here).toMatchObject({ position: 6, number: 2, time: "09:00" });
    expect(names(a.nextTimepoints)).toEqual(["Shopping Exemplo", "Estádio Inventado", "Terminal Exemplo"]);
    expect(a.firstReturn).toEqual({ name: "Estádio Inventado", time: "10:00" });
    const back = a.stops.find((s) => s.returnsHere)!;
    expect([back.position, back.number, back.isLast]).toEqual([12, 3, false]);
  });

  it("3ª passagem (posição 12): sem volta; um só ponto de controle (o Terminal, que é o fim)", async () => {
    const a = await ahead("0810", 12);
    expect(a.here).toMatchObject({ number: 3, time: "10:00" });
    expect(a.stops.map((s) => s.position)).toEqual([13]);
    expect(a.firstReturn).toBeNull();
    expect(a.nextTimepoints).toEqual([{ name: "Terminal Exemplo", time: "10:10" }]);
  });

  it("passagem na última posição: nada daqui para a frente", async () => {
    const a = await ahead("0810", 13);
    expect(a.isLast).toBe(true);
    expect(a.stops).toEqual([]);
    expect(a.nextTimepoints).toEqual([]);
    expect(a.firstReturn).toBeNull();
    expect(summaryText(a)).toBeNull();
  });

  it("ponto que a linha passa uma vez só: sem número", async () => {
    const a = await ahead("0810", 2);
    expect(a.here.number).toBeNull();
    expect(a.isFirst).toBe(false);
  });

  it("viagem parcial: só as paragens da viagem (do Campus ao Shopping)", async () => {
    const a = await ahead("0900", 4);
    expect(a.tripStart).toBe("09:00"); // a viagem parcial sai do Campus
    expect(a.isFirst).toBe(true);
    expect(a.stops.map((s) => s.position)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(a.stops.at(-1)).toMatchObject({ name: "Shopping Exemplo", isLast: true, time: "09:46" });
    expect(a.firstReturn).toBeNull();
  });

  it("deslocamento no horário: 0 por padrão (sem uso até a E-03) e soma minutos em tudo se informado", async () => {
    const base = await ahead("0810", 1);
    expect(await ahead("0810", 1, { shiftMinutes: 0 })).toEqual(base);
    const shifted = await ahead("0810", 1, { shiftMinutes: 5 });
    expect(shifted.tripStart).toBe("08:15");
    expect(shifted.here.time).toBe("08:15");
    expect(shifted.stops.find((s) => s.position === 4)!.time).toBe("08:49");
    expect(shifted.stops.at(-1)!.time).toBe("10:15");
  });

  it("viagem ou posição que não existem: null", async () => {
    snapshot ??= await load(seed);
    expect(buildAhead("nao-existe", 1, snapshot)).toBeNull();
    expect(buildAhead(tripId("0810"), 99, snapshot)).toBeNull();
    expect(buildAhead(tripId("0900"), 1, snapshot)).toBeNull(); // posição fora do trecho da viagem parcial
  });
});

describe("timelineItems: o que abre e o que vira '+ N paragens'", () => {
  it("abre tudo até o 1º ponto de controle; depois, só controle, volta e fim; 2 ou mais comuns viram lacuna", async () => {
    const a = await ahead("0810", 1);
    const items = timelineItems(a.stops).map((i) => (i.kind === "gap" ? `+${i.count}` : i.row.position));
    // 2 3 4(controle) | 5 sozinha fica | 6(controle) | 7 8 9 = +3 | 10(controle) | 11 sozinha fica | 12 13
    expect(items).toEqual([2, 3, 4, 5, 6, "+3", 10, 11, 12, 13]);
  });

  it("sem ponto de controle à frente: tudo aberto até o fim", () => {
    const row = (position: number, over: object = {}) =>
      ({ position, name: `P${position}`, time: "08:00", rangeStart: "07:58", rangeEnd: "08:02", kind: "interpolated", confidence: "estimated", isTimepoint: false, number: null, returnsHere: false, isLast: false, ...over }) as Ahead["stops"][number];
    const items = timelineItems([row(2), row(3), row(4, { isLast: true })]);
    expect(items.every((i) => i.kind === "stop")).toBe(true);
    expect(items).toHaveLength(3);
  });

  it("lista vazia: nada", () => {
    expect(timelineItems([])).toEqual([]);
  });
});

describe("textos da TL-05 (4.6 §3.9)", () => {
  it("contexto: com e sem número da passagem", async () => {
    expect(contextText(await ahead("0810", 6))).toBe("viagem das 08:10 · Estádio Inventado, 2ª passagem");
    expect(contextText(await ahead("0810", 2))).toBe("viagem das 08:10 · Arrabalde Fictício");
  });

  it("frase-resumo com 3 pontos de controle e volta", async () => {
    const text = summaryText(await ahead("0810", 1))!;
    expect(text).toBe("**Está indo** para Campus Exemplo, Estádio Inventado e Shopping Exemplo. Depois **volta aqui às 09:00**.");
    expect(summaryPlain(text)).not.toContain("**");
  });

  it("frase-resumo com 2 pontos de controle", async () => {
    const a = await ahead("0810", 7);
    expect(a.nextTimepoints).toHaveLength(3); // 10, 12, 13
    const two = { ...a, nextTimepoints: a.nextTimepoints.slice(0, 2) };
    expect(summaryText(two)).toBe("**Está indo** para Shopping Exemplo e Estádio Inventado.");
  });

  it("frase-resumo com 1 ponto de controle e sem volta: omite o trecho da volta", async () => {
    const text = summaryText(await ahead("0810", 12))!;
    expect(text).toBe("**Está indo** para Terminal Exemplo.");
    expect(text).not.toContain("volta");
  });

  it("frase-resumo sem volta e com 3 pontos de controle (passagem em Rua A)", async () => {
    const a = await ahead("0810", 7);
    expect(a.firstReturn).toBeNull(); // Rua A é única no percurso
    expect(summaryText(a)).toBe("**Está indo** para Shopping Exemplo, Estádio Inventado e Terminal Exemplo.");
  });

  it("negrito do catálogo vira trechos", () => {
    expect(boldSegments("**Está indo** para X. Depois **volta aqui às 09:00**.")).toEqual([
      { text: "Está indo", bold: true },
      { text: " para X. Depois ", bold: false },
      { text: "volta aqui às 09:00", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("etiqueta de volta: '· fim' só quando a volta é a última paragem", async () => {
    const a = await ahead("0810", 1);
    const mid = a.stops.find((s) => s.position === 6)!;
    expect(returnTag(mid)).toBe("↺ volta aqui");
    expect(returnTag({ returnsHere: true, isLast: true })).toBe("↺ volta aqui · fim");
    expect(returnTag(a.stops[0]!)).toBeNull();
  });

  it("VoiceOver: hora, nome, 'você', ponto de controle e volta, num bloco só (D-047)", async () => {
    const a = await ahead("0810", 1);
    expect(stopA11y(a.here, true)).toBe("08:10, Estádio Inventado, você, ponto de controle");
    expect(stopA11y(a.stops.find((s) => s.position === 4)!, false)).toBe("08:44, Campus Exemplo, ponto de controle");
    expect(stopA11y(a.stops.find((s) => s.position === 6)!, false)).toBe("09:00, Estádio Inventado, ponto de controle, volta aqui");
    expect(stopA11y(a.stops[0]!, false)).toBe("08:21, Arrabalde Fictício");
  });
});

describe("buildAhead: velocidade", () => {
  it("viagem longa (600 paragens, 400 viagens) abaixo de 50 ms com dados sintéticos", () => {
    const stopCount = 600;
    const stops = Array.from({ length: stopCount }, (_, i) => ({ position: i + 1, stopId: `s${i % 450}`, isTimepoint: i % 10 === 0 }));
    const pattern = { id: "p", stops };
    const trips = Array.from({ length: 400 }, (_, n) => ({
      id: `t${n}`,
      patternId: "p",
      firstPosition: 1,
      lastPosition: stopCount,
      stopTimes: stops.filter((s) => s.isTimepoint || s.position === stopCount).map((s) => ({ position: s.position, serviceMinute: 300 + n + s.position, origin: "official" as const })),
    }));
    const data = {
      patterns: [pattern],
      trips,
      patternLine: new Map([["p", { code: "7", color: "#F57C00" }]]),
      stopNames: new Map(Array.from({ length: 450 }, (_, i) => [`s${i}`, `Paragem ${i}`])),
    } as unknown as ScheduleSnapshot;
    // Aquece o JIT antes da medição para isolar tempo de compilação da execução
    for (let w = 0; w < 3; w++) {
      const warmup = buildAhead("t0", 1, data);
      if (warmup) timelineItems(warmup.stops);
    }
    const t0 = performance.now();
    const a = buildAhead("t399", 3, data);
    timelineItems(a!.stops);
    const elapsed = performance.now() - t0;
    expect(a!.stops).toHaveLength(stopCount - 3);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("buildAhead: aprendizado (E-08.5 bloco 10, T-132)", () => {
  const lisbon = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`) - 3_600_000;

  it("sem learning e com learning: { records: [] }: toEqual ao resultado sem opções", async () => {
    snapshot ??= await load(seed);
    const tId = tripId("0810");
    const baseline = buildAhead(tId, 1, snapshot)!;
    const emptyLearning = buildAhead(tId, 1, snapshot, { learning: { records: [], now: lisbon("2026-09-02", "08:00") } })!;
    expect(emptyLearning).toEqual(baseline);
  });

  it("T-132: 4 registros auto de +6 na posição tocada -> here.time é base + 6 (08:16) e igual ao de buildStopDay", async () => {
    snapshot ??= await load(seed);
    const tId = tripId("0810");
    const instant = lisbon("2026-09-02", "08:00");
    const serviceDay = aheadServiceDay(snapshot, tId, instant)!;
    expect(serviceDay).toEqual({ date: "2026-09-02", dayType: "weekday" });

    const target = passageTarget(snapshot, tId, 1, serviceDay.date, serviceDay.dayType)!;
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: instant - d * 86_400_000,
      serviceDate: serviceDay.date,
      dayType: target.dayType,
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const a = buildAhead(tId, 1, snapshot, { learning: { records, now: instant } })!;
    expect(a).not.toBeNull();
    // 08:10 + 6 min = 08:16
    expect(a.here.time).toBe("08:16");
    expect(a.here.confidence).toBe("medium");

    // Compara com buildStopDay chamado no mesmo teste com o mesmo instant e dayType:
    const estadioStopId = target.stopId;
    const day = buildStopDay(estadioStopId, snapshot, instant, serviceDay.dayType, records)!;
    const stopDayRow = day.lines.flatMap((l) => l.rows).find((r) => r.tripId === tId && r.position === 1)!;
    expect(stopDayRow).toBeDefined();
    expect(a.here.time).toBe(stopDayRow.time);
  });

  it("paragens seguintes: cada time bate com displayCenter(expectedTime) direto no teste, e a frase-resumo usa os mesmos horários", async () => {
    snapshot ??= await load(seed);
    const tId = tripId("0810");
    const instant = lisbon("2026-09-02", "08:00");
    const serviceDay = aheadServiceDay(snapshot, tId, instant)!;
    const trip = snapshot.trips.find((t) => t.id === tId)!;

    // Registros nas paragens 1 (+6) e 4 (+10)
    const target1 = passageTarget(snapshot, tId, 1, serviceDay.date, serviceDay.dayType)!;
    const target4 = passageTarget(snapshot, tId, 4, serviceDay.date, serviceDay.dayType)!;
    const records: PassageRecord[] = [
      ...[1, 2, 3, 4].map((d) => ({
        deviation: 6,
        observedAt: instant - d * 86_400_000,
        serviceDate: serviceDay.date,
        dayType: target1.dayType,
        tripId: target1.tripId,
        patternId: target1.patternId,
        position: target1.position,
        stopId: target1.stopId,
        matchStatus: "auto" as const,
        mode: "live" as const,
        kind: "boarded" as const,
      })),
      ...[1, 2, 3, 4].map((d) => ({
        deviation: 10,
        observedAt: instant - d * 86_400_000,
        serviceDate: serviceDay.date,
        dayType: target4.dayType,
        tripId: target4.tripId,
        patternId: target4.patternId,
        position: target4.position,
        stopId: target4.stopId,
        matchStatus: "auto" as const,
        mode: "live" as const,
        kind: "boarded" as const,
      })),
    ];

    const a = buildAhead(tId, 1, snapshot, { learning: { records, now: instant } })!;

    // Confere cada paragem seguinte contra expectedTime direto
    for (const stop of a.stops) {
      const target = passageTarget(snapshot, tId, stop.position, serviceDay.date, serviceDay.dayType)!;
      const base = baseTimeAt(trip, stop.position)!;
      const exp = expectedTime(base, records, { target, now: instant, marginMinutes: snapshot.margin });
      expect(stop.time).toBe(clockText(displayCenter(exp.center)));
      expect(stop.rangeStart).toBe(clockText(displayCenter(exp.rangeStart)));
      expect(stop.rangeEnd).toBe(clockText(displayCenter(exp.rangeEnd)));
      expect(stop.confidence).toBe(exp.confidence);
    }

    // nextTimepoints e firstReturn usam os mesmos horários das paragens da lista
    for (const ntp of a.nextTimepoints) {
      const match = a.stops.find((s) => s.isTimepoint && s.name === ntp.name && s.time === ntp.time);
      expect(match).toBeDefined();
    }
    if (a.firstReturn) {
      const match = a.stops.find((s) => s.returnsHere && s.name === a.firstReturn!.name && s.time === a.firstReturn!.time);
      expect(match).toBeDefined();
    }
  });

  it("viagem em curso (shiftMinutes: 5): learning é ignorado (D-070), idêntico a sem learning com shiftMinutes: 5", async () => {
    snapshot ??= await load(seed);
    const tId = tripId("0810");
    const instant = lisbon("2026-09-02", "08:00");
    const serviceDay = aheadServiceDay(snapshot, tId, instant)!;
    const target = passageTarget(snapshot, tId, 1, serviceDay.date, serviceDay.dayType)!;
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: instant - d * 86_400_000,
      serviceDate: serviceDay.date,
      dayType: target.dayType,
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const withLearning = buildAhead(tId, 1, snapshot, { shiftMinutes: 5, learning: { records, now: instant } })!;
    const withoutLearning = buildAhead(tId, 1, snapshot, { shiftMinutes: 5 })!;
    expect(withLearning).toEqual(withoutLearning);
  });

  it("L20: viagem de sábado aberta numa quarta aprende (+6) com registros de sábado", async () => {
    const { data } = await learnedFixture();
    // Quarta-feira 07/10/2026 (dia útil) às 10:00
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const satTripId = learnedTripIdOf("1", "0810_sat");
    const serviceDay = aheadServiceDay(data, satTripId, wednesdayNow)!;
    expect(serviceDay).toEqual({ date: "2026-10-07", dayType: "saturday" });

    const target = passageTarget(data, satTripId, 1, serviceDay.date, serviceDay.dayType)!;
    expect(target.dayType).toBe("saturday");

    // 4 registros auto de sábado de +6 na posição 1: base 490 (08:10) + 6 = 496 ("08:16")
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: wednesdayNow - d * 86_400_000,
      serviceDate: `2026-10-0${d}`,
      dayType: "saturday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const a = buildAhead(satTripId, 1, data, { learning: { records, now: wednesdayNow } })!;
    expect(a).not.toBeNull();
    // Aprende +6: 08:16. Com mutação (sem serviceDay.dayType passado a passageTarget):
    // o alvo vira weekday e não aprende registros de saturday, dando 08:10.
    expect(a.here.time).toBe("08:16");
  });
});
