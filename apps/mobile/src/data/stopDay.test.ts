/// <reference types="node" />
// Dados inventados (D-091). Ver `db/testing/lineSeed.ts`. Horários de serviço: 08:10 = 490, 10:00 = 600, 24:00 = 1440.
import { type SeedFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { type LineSpec, lineSeed } from "../db/testing/lineSeed";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";
import { buildStopCard } from "./stopCard";
import { buildStopDay } from "./stopDay";
import { dayTypeChipText, emptyTexts, lineHeaderText, passageNotes, rowA11y, rowRangeText, rowTimeText } from "./stopDayText";

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

/** Instante de um relógio de parede em Lisboa. `summer` = hora de verão (UTC+1, de março a outubro). */
const lisbon = (date: string, hhmm: string, summer = true) => Date.parse(`${date}T${hhmm}:00Z`) - (summer ? 3_600_000 : 0);

const NAMES = {
  praca: "Praça Inventada",
  rua: "Rua Exemplo",
  largo: "Largo Fictício",
  estadio: "Estádio Inventado",
  mercado: "Mercado Fictício",
  campus: "Campus Exemplo",
  terminal: "Terminal Exemplo",
  vila: "Vila Exemplo",
};

const OFF_SEASON = { startMd: "07-01", endMd: "08-31", mode: "exclude" } as const;

const LINES: LineSpec[] = [
  // Linha 1: dia útil, 08:10 na Praça e 08:20 no Terminal; a Rua (posição 2) fica em 08:12, interpolado (±4).
  {
    code: "1",
    color: "#7A3FF2",
    stops: [{ stop: "praca", timepoint: true }, { stop: "rua" }, { stop: "largo" }, { stop: "mercado" }, { stop: "estadio" }, { stop: "terminal", timepoint: true }],
    trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 6: 500 } }],
  },
  // Linha 2: dia útil e sábado, sem tabela de domingo; termina no Campus.
  {
    code: "2",
    color: "#D32F2F",
    stops: [{ stop: "terminal", timepoint: true }, { stop: "campus", timepoint: true }],
    trips: [
      { id: "0800", days: ["weekday", "saturday"], times: { 1: 480, 2: 495 } },
      { id: "0900", days: ["weekday", "saturday"], times: { 1: 540, 2: 555 } },
    ],
  },
  // Linha 3: só fim de semana, fora de julho e agosto.
  {
    code: "3",
    color: "#4FC3F7",
    stops: [{ stop: "praca", timepoint: true }, { stop: "largo", timepoint: true }],
    trips: [{ id: "0900", days: ["saturday", "sunday_holiday"], season: OFF_SEASON, times: { 1: 540, 2: 550 } }],
  },
  // Linha 5: percurso que passa três vezes no Estádio (posições 1, 4 e 6).
  {
    code: "5",
    color: "#2E7D32",
    stops: [
      { stop: "estadio" }, { stop: "rua" }, { stop: "mercado", timepoint: true },
      { stop: "estadio" }, { stop: "largo", timepoint: true }, { stop: "estadio", timepoint: true },
    ],
    trips: [{ id: "1000", days: ["weekday"], times: { 1: 600, 3: 610, 5: 620, 6: 630 } }],
  },
  // Linha 9: só dias úteis, fora de julho e agosto.
  {
    code: "9",
    color: "#1C1C1E",
    stops: [{ stop: "vila", timepoint: true }, { stop: "praca", timepoint: true }, { stop: "largo", timepoint: true }],
    trips: [{ id: "0700", days: ["weekday"], season: OFF_SEASON, times: { 1: 420, 2: 430, 3: 440 } }],
  },
  // Linha 4: a viagem de sábado "00:00" (hora de serviço 24:00), que passa pela Rua às 00:10 de domingo.
  {
    code: "4",
    color: "#1E3A8A",
    stops: [{ stop: "praca", timepoint: true }, { stop: "rua" }, { stop: "largo", timepoint: true }],
    trips: [{ id: "2400", days: ["saturday"], times: { 1: 1440, 3: 1460 } }],
  },
];

const seed = lineSeed(NAMES, LINES);
const idOf = (short: keyof typeof NAMES) => seed.stops.find((s) => s.key === `mobilis/stop/${short}`)!.id;
let snapshot: ScheduleSnapshot;
async function day(short: keyof typeof NAMES, instant: number, dayType?: Parameters<typeof buildStopDay>[3]) {
  snapshot ??= await load(seed);
  const result = buildStopDay(idOf(short), snapshot, instant, dayType);
  expect(result).not.toBeNull();
  return result!;
}
const lineOf = (d: Awaited<ReturnType<typeof day>>, code: string) => d.lines.find((l) => l.code === code)!;

describe("buildStopDay: passagem de uma linha", () => {
  it("quinta 08:00, Rua: a das 08:12, faixa 08:08–08:16, esteja às 08:06, interpolado (T-01)", async () => {
    const d = await day("rua", lisbon("2026-09-03", "08:00"));
    expect(d.name).toBe("Rua Exemplo");
    expect(d.dayType).toBe("weekday");
    expect(d.todayType).toBe("weekday");
    expect(d.lines.map((l) => l.code)).toEqual(["1", "4", "5"]); // a 4 é só de sábado: aparece, com o porquê
    expect(lineOf(d, "4").empty?.reason).toEqual({ kind: "no_table" });
    const row = lineOf(d, "1").rows[0]!;
    expect(row).toMatchObject({
      time: "08:12", rangeStart: "08:08", rangeEnd: "08:16", beAtStop: "08:06",
      confidence: "estimated", number: null, isNext: true, mayPassNow: false, isFirst: false, isLast: false,
    });
    expect(row.origin).toBe("Praça Inventada");
    expect(row.destination).toEqual({ name: "Terminal Exemplo", time: "08:20" });
    expect(row.tripDestination).toBe("Terminal Exemplo");
    expect(lineOf(d, "1").destination).toBe("Terminal Exemplo");
  });

  it("chega às 08:09, base 08:12, faixa até 08:16: continua a próxima e \"pode passar a qualquer momento\"", async () => {
    const d = await day("rua", lisbon("2026-09-03", "08:09"));
    const row = lineOf(d, "1").rows[0]!;
    expect(row).toMatchObject({ time: "08:12", rangeEnd: "08:16", beAtStop: "08:06", isNext: true, mayPassNow: true });
  });

  it("às 08:06 em ponto o \"esteja no ponto\" ainda não passou; às 08:07 passou", async () => {
    const at0806 = lineOf(await day("rua", lisbon("2026-09-03", "08:06")), "1").rows[0]!;
    expect(at0806.mayPassNow).toBe(false);
    const at0807 = lineOf(await day("rua", lisbon("2026-09-03", "08:07")), "1").rows[0]!;
    expect(at0807.mayPassNow).toBe(true);
  });

  it("depois do centro (08:13): fica na lista até o fim da faixa, mas já não é o próximo", async () => {
    const line = lineOf(await day("rua", lisbon("2026-09-03", "08:13")), "1");
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]).toMatchObject({ isNext: false, mayPassNow: true });
    expect(line.empty).toBeNull();
  });

  it("às 08:16 ainda está na lista; às 08:17 sai e a linha mostra o próximo dia", async () => {
    expect(lineOf(await day("rua", lisbon("2026-09-03", "08:16")), "1").rows).toHaveLength(1);
    const line = lineOf(await day("rua", lisbon("2026-09-03", "08:17")), "1");
    expect(line.rows).toEqual([]);
    expect(line.empty).toEqual({ reason: null, next: { date: "2026-09-04", weekday: 5, time: "08:12" } });
  });

  it("a madrugada de domingo olha o sábado: a viagem das 24:00 passa na Rua às 00:10 (T-28)", async () => {
    const d = await day("rua", lisbon("2026-09-06", "00:10"));
    expect(d.todayType).toBe("sunday_holiday");
    const line = lineOf(d, "4");
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]).toMatchObject({ time: "00:10", isNext: true, mayPassNow: true });
    expect(line.rows[0]!.key.startsWith("2026-09-05/")).toBe(true); // dia de serviço de sábado
  });
});

describe("buildStopDay: estável entre renders (bloco 4b)", () => {
  it("mesmo \"agora\": mesmo conteúdo e as mesmas chaves de linha, na mesma ordem (a lista não é remontada)", async () => {
    const at = lisbon("2026-09-03", "08:00");
    const a = await day("rua", at);
    const b = await day("rua", at);
    expect(b).toEqual(a);
    const keys = (d: typeof a) => d.lines.flatMap((l) => l.rows.map((r) => r.key));
    expect(keys(b)).toEqual(keys(a));
    expect(new Set(keys(a)).size).toBe(keys(a).length);
  });

  it("o minuto seguinte só muda o que depende do horário: as chaves das passagens que continuam são as mesmas", async () => {
    const a = await day("rua", lisbon("2026-09-03", "08:00"));
    const b = await day("rua", lisbon("2026-09-03", "08:01"));
    const keys = (d: typeof a) => d.lines.flatMap((l) => l.rows.map((r) => r.key));
    expect(keys(b)).toEqual(keys(a));
  });
});

describe("buildStopDay: número, origem, destino e pontas (§3.6, D-094)", () => {
  it("Estádio na linha 5: 1ª, 2ª e 3ª passagens, com origem e destino", async () => {
    const d = await day("estadio", lisbon("2026-09-03", "09:00"));
    const rows = lineOf(d, "5").rows;
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.position)).toEqual([1, 4, 6]);

    expect(rows[0]).toMatchObject({ time: "10:00", isFirst: true, isLast: false, origin: null, isNext: true });
    expect(rows[0]!.destination).toEqual({ name: "Mercado Fictício", time: "10:10" });

    expect(rows[1]).toMatchObject({ time: "10:15", rangeStart: "10:11", rangeEnd: "10:19", beAtStop: "10:09", isFirst: false, isLast: false, isNext: false });
    expect(rows[1]!.origin).toBe("Mercado Fictício");
    expect(rows[1]!.destination).toEqual({ name: "Largo Fictício", time: "10:20" });

    expect(rows[2]).toMatchObject({ time: "10:30", rangeStart: "10:28", rangeEnd: "10:32", beAtStop: "10:26", isFirst: false, isLast: true, isNext: false });
    expect(rows[2]!.origin).toBe("Largo Fictício");
    expect(rows[2]!.destination).toBeNull();
  });

  it("a passagem que termina no ponto nunca é a próxima", async () => {
    const rows = lineOf(await day("estadio", lisbon("2026-09-03", "10:20")), "5").rows; // 1ª e 2ª já passaram
    expect(rows.map((r) => r.number)).toEqual([3]);
    expect(rows[0]).toMatchObject({ isLast: true, isNext: false, mayPassNow: false });
  });

  it("linha que acaba no ponto: cabeçalho \"(fim do percurso)\"; linha que só passa, não", async () => {
    const campus = await day("campus", lisbon("2026-09-03", "07:00"));
    expect(lineOf(campus, "2").endsHere).toBe(true);
    expect(lineOf(campus, "2").rows.every((r) => r.isLast && !r.isNext)).toBe(true);
    const rua = await day("rua", lisbon("2026-09-03", "07:00"));
    expect(lineOf(rua, "1").endsHere).toBe(false);
  });

  it("origem antes do início de uma viagem parcial não aparece", async () => {
    const partial = lineSeed(NAMES, [
      {
        code: "6", color: "#C7017F",
        stops: [{ stop: "praca", timepoint: true }, { stop: "rua", timepoint: true }, { stop: "largo", timepoint: true }],
        trips: [{ id: "0800", days: ["weekday"], first: 2, last: 3, times: { 2: 480, 3: 490 } }],
      },
    ]);
    const snap = await load(partial);
    const id = partial.stops.find((s) => s.key === "mobilis/stop/rua")!.id;
    const row = buildStopDay(id, snap, lisbon("2026-09-03", "07:00"))!.lines[0]!.rows[0]!;
    expect(row).toMatchObject({ isFirst: true, origin: null });
    expect(row.destination).toEqual({ name: "Largo Fictício", time: "08:10" });
  });
});

describe("buildStopDay: tipo de dia (chip) e dia sem serviço", () => {
  it("sábado numa quinta: a lista inteira do sábado, sem próximo nem \"pode passar\"", async () => {
    const d = await day("terminal", lisbon("2026-09-03", "09:30"), "saturday");
    expect(d.dayType).toBe("saturday");
    expect(d.todayType).toBe("weekday");
    const rows = lineOf(d, "2").rows;
    expect(rows.map((r) => r.time)).toEqual(["08:00", "09:00"]); // inclusive as que já "passaram" hoje
    expect(rows.some((r) => r.isNext || r.mayPassNow)).toBe(false);
  });

  it("trocar o tipo de dia mantém a época de hoje: sábado em agosto não tem a linha 3", async () => {
    const august = lineOf(await day("praca", lisbon("2026-08-05", "10:00"), "saturday"), "3");
    expect(august.rows).toEqual([]);
    expect(august.empty?.reason).toEqual({ kind: "season", months: [7, 8] });
    const september = lineOf(await day("praca", lisbon("2026-09-02", "10:00"), "saturday"), "3");
    expect(september.rows.map((r) => r.time)).toEqual(["09:00"]);
  });

  it("5e: tabela que só vale de 01/09 (como a da MOBILIS): em 12/08 a linha 9 diz a época, no cartão e na folha", async () => {
    const fromSeptember = await load(lineSeed(NAMES, LINES, "2026-09-01"));
    const instant = lisbon("2026-08-12", "12:00");
    const sheet = lineOf(buildStopDay(idOf("vila"), fromSeptember, instant)!, "9");
    expect(sheet.rows).toEqual([]);
    expect(sheet.empty).toEqual({ reason: { kind: "season", months: [7, 8] }, next: { date: "2026-09-01", weekday: 2, time: "07:00" } });
    const card = buildStopCard(idOf("vila"), fromSeptember, instant)!.lines.find((l) => l.code === "9")!;
    expect(card.state).toMatchObject({ status: "later", reason: { kind: "season", months: [7, 8] }, date: "2026-09-01" });
    // 31/08 ainda é época; 01/09 volta a circular (terça, 07:00).
    const last = lineOf(buildStopDay(idOf("vila"), fromSeptember, lisbon("2026-08-31", "12:00"))!, "9");
    expect(last.empty?.reason).toEqual({ kind: "season", months: [7, 8] });
    const back = lineOf(buildStopDay(idOf("vila"), fromSeptember, lisbon("2026-09-01", "06:00"))!, "9");
    expect(back.rows.map((r) => r.time)).toEqual(["07:00"]);
  });

  it("os quatro motivos de dia sem serviço (T-32)", async () => {
    // (1) sem tabela para esse tipo de dia: linha 2 no domingo, no Campus
    const sunday = lineOf(await day("campus", lisbon("2026-09-06", "10:00")), "2");
    expect(sunday.rows).toEqual([]);
    expect(sunday.empty).toEqual({ reason: { kind: "no_table" }, next: { date: "2026-09-07", weekday: 1, time: "08:15" } });
    // (2) linha só de dias úteis: linha 9 no sábado
    const saturday = lineOf(await day("vila", lisbon("2026-09-05", "10:00")), "9");
    expect(saturday.empty).toEqual({ reason: { kind: "weekdays_only" }, next: { date: "2026-09-07", weekday: 1, time: "07:00" } });
    // (3) época sem serviço: linha 9 num dia útil de agosto (T-10)
    const august = lineOf(await day("vila", lisbon("2026-08-12", "10:00")), "9");
    expect(august.empty).toEqual({ reason: { kind: "season", months: [7, 8] }, next: { date: "2026-09-01", weekday: 2, time: "07:00" } });
    // (4) feriado: terça 08/12/2026 usa a tabela de domingo/feriado, que a linha 9 não tem
    const holiday = await day("vila", lisbon("2026-12-08", "07:00", false));
    expect(holiday.todayType).toBe("sunday_holiday");
    expect(lineOf(holiday, "9").empty).toEqual({ reason: { kind: "sunday_holiday" }, next: { date: "2026-12-09", weekday: 3, time: "07:00" } });
  });

  it("o tipo de dia pedido sem tabela mostra o motivo do tipo, não o de hoje", async () => {
    const d = await day("campus", lisbon("2026-09-03", "09:30"), "sunday_holiday");
    expect(lineOf(d, "2").empty?.reason).toEqual({ kind: "no_table" });
  });

  it("ponto que não existe mais: sem folha", async () => {
    snapshot ??= await load(seed);
    expect(buildStopDay("nao-existe", snapshot, lisbon("2026-09-03", "08:00"))).toBeNull();
  });
});

describe("textos da folha do ponto (4.6)", () => {
  it("chip de tipo de dia", () => {
    expect(dayTypeChipText("weekday", true)).toBe("Hoje · dia útil");
    expect(dayTypeChipText("weekday", false)).toBe("Dia útil");
    expect(dayTypeChipText("saturday", false)).toBe("Sábado");
    expect(dayTypeChipText("saturday", true)).toBe("Hoje · sábado");
    expect(dayTypeChipText("sunday_holiday", false)).toBe("Domingo/feriado");
  });

  it("horário e frases de apoio da passagem", async () => {
    const rows = lineOf(await day("estadio", lisbon("2026-09-03", "09:00")), "5").rows;
    expect(rowTimeText(rows[1]!)).toBe("~10:15");
    expect(rowRangeText(rows[1]!)).toBe("10:11–10:19");
    expect(passageNotes(rows[0]!)).toEqual(["começa aqui · Mercado Fictício 10:10"]);
    expect(passageNotes(rows[1]!)).toEqual(["2ª passagem · veio Mercado Fictício"]);
    expect(passageNotes(rows[2]!)).toEqual(["3ª passagem · veio Largo Fictício", "fim do percurso · não embarque"]);
    const rua = lineOf(await day("rua", lisbon("2026-09-03", "08:00")), "1").rows[0]!;
    expect(passageNotes(rua)).toEqual([]);
  });

  it("cabeçalho da linha e dia sem serviço", async () => {
    const campus = lineOf(await day("campus", lisbon("2026-09-03", "07:00")), "2");
    expect(lineHeaderText(campus)).toEqual({ direction: "→ Campus Exemplo", end: "(fim do percurso)" });
    const rua = lineOf(await day("rua", lisbon("2026-09-03", "08:00")), "1");
    expect(lineHeaderText(rua)).toEqual({ direction: "→ Terminal Exemplo", end: null });
    const none = lineOf(await day("campus", lisbon("2026-09-06", "10:00")), "2");
    expect(emptyTexts(none.empty!)).toEqual({ reason: "Sem horário para este tipo de dia", next: "próximo: segunda, 08:15" });
    const season = lineOf(await day("vila", lisbon("2026-08-12", "10:00")), "9");
    expect(emptyTexts(season.empty!).reason).toBe("não circula em julho e agosto");
  });

  it("VoiceOver lê cada passagem como um bloco", async () => {
    const rua = lineOf(await day("rua", lisbon("2026-09-03", "08:00")), "1");
    expect(rowA11y(rua, rua.rows[0]!)).toBe(
      "Linha 1, para Terminal Exemplo, próximo às 08:12, faixa 08:08 a 08:16, esteja no ponto às 08:06, estimado",
    );
    const estadio = lineOf(await day("estadio", lisbon("2026-09-03", "09:00")), "5");
    expect(rowA11y(estadio, estadio.rows[1]!)).toBe(
      "Linha 5, para Estádio Inventado, passagem 2, veio Mercado Fictício, às 10:15, faixa 10:11 a 10:19, esteja no ponto às 10:09, estimado",
    );
    expect(rowA11y(estadio, estadio.rows[2]!)).toBe(
      "Linha 5, para Estádio Inventado, passagem 3, veio Largo Fictício, às 10:30, faixa 10:28 a 10:32, fim do percurso · não embarque, estimado",
    );
    const late = lineOf(await day("rua", lisbon("2026-09-03", "08:09")), "1");
    expect(rowA11y(late, late.rows[0]!)).toBe(
      "Linha 1, para Terminal Exemplo, próximo às 08:12, faixa 08:08 a 08:16, Pode passar a qualquer momento, até 08:16, estimado",
    );
  });
});
