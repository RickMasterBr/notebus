import { describe, expect, it } from "vitest";
import {
  addDays,
  dayTypeOf,
  lineServiceOn,
  lisbonWallClock,
  serviceDaysAt,
  tripsRunningOn,
  type CalendarData,
  type ScheduleData,
} from "./calendar.ts";
import { formatServiceMinute } from "./serviceMinute.ts";

// Exemplo inventado (D-091), com a forma da MOBILIS: nomes, IDs e horários não são os reais.
const EMPTY: CalendarData = { overrides: [], holidays: [] };
/** O feriado municipal como o seed grava (uma linha por ano). */
const LEIRIA: CalendarData = {
  overrides: [],
  holidays: [2026, 2027, 2028, 2029, 2030].map((y) => ({ date: `${y}-05-22`, name: "Feriado municipal de Leiria" })),
};
const SUMMER = { id: "season-summer", startMd: "07-01", endMd: "08-31", mode: "exclude" as const };
// Vigência inventada desde 2025, para as datas dos testes (agosto e maio de 2026) caírem dentro dela.
const TT = { id: "tt-1", validFrom: "2025-09-01", validTo: null };

/** "Linha A": útil, sábado (com a viagem "00:00" = 24:00) e domingo. */
const lineA: ScheduleData = {
  timetables: [TT],
  seasons: [],
  trips: [
    { id: "a-util-0640", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: null },
    { id: "a-sab-2400", timetableId: "tt-1", dayTypes: ["saturday"], seasonId: null },
    { id: "a-dom-0900", timetableId: "tt-1", dayTypes: ["sunday_holiday"], seasonId: null },
  ],
};
/** "Linha do Campus": útil e sábado, sem domingo. */
const lineCampus: ScheduleData = {
  timetables: [TT],
  seasons: [],
  trips: [
    { id: "c-util", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: null },
    { id: "c-sab", timetableId: "tt-1", dayTypes: ["saturday"], seasonId: null },
  ],
};
/** "Linha 9": só dias úteis, sem julho e agosto. */
const line9: ScheduleData = {
  timetables: [TT],
  seasons: [SUMMER],
  trips: [
    { id: "9-util-1", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: SUMMER.id },
    { id: "9-util-2", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: SUMMER.id },
  ],
};

/** Instante a partir da hora de Lisboa com o deslocamento explícito: `at("2026-10-25T01:30", "+01:00")`. */
const at = (local: string, offset: "+00:00" | "+01:00") => Date.parse(`${local}:00${offset}`);

describe("tipo de dia (§3.1)", () => {
  it("T-08: 25/12/2025, quinta, é domingo/feriado", () => {
    expect(dayTypeOf("2025-12-25", EMPTY)).toMatchObject({ dayType: "sunday_holiday", reason: "holiday" });
  });

  it("T-30 (a): 22/05/2026 (sexta) e 22/05/2027 (sábado) são domingo/feriado pelo municipal gravado", () => {
    for (const date of ["2026-05-22", "2027-05-22"]) {
      expect(dayTypeOf(date, LEIRIA)).toEqual({ dayType: "sunday_holiday", reason: "holiday", holidayName: "Feriado municipal de Leiria" });
    }
    // Sem a linha gravada, a biblioteca não conhece o municipal (P-07): sexta = útil.
    expect(dayTypeOf("2026-05-22", EMPTY)).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("T-30 (b): 24/12 é dia útil (véspera de Natal é observância, não feriado oficial)", () => {
    expect(dayTypeOf("2026-12-24", EMPTY)).toEqual({ dayType: "weekday", reason: "weekday" });
    expect(dayTypeOf("2026-12-31", EMPTY)).toEqual({ dayType: "weekday", reason: "weekday" }); // véspera de Ano Novo
    expect(dayTypeOf("2026-02-17", EMPTY)).toEqual({ dayType: "weekday", reason: "weekday" }); // Carnaval
  });

  it("T-30 (c): a exceção ganha do feriado", () => {
    const cal: CalendarData = { ...LEIRIA, overrides: [{ date: "2026-05-22", dayType: "weekday" }] };
    expect(dayTypeOf("2026-05-22", cal)).toEqual({ dayType: "weekday", reason: "override" });
  });

  it("nacionais móveis e fixos: Sexta-Feira Santa, Corpo de Deus, 25 de Abril", () => {
    for (const date of ["2026-04-03", "2026-06-04", "2027-04-25"]) expect(dayTypeOf(date, EMPTY).reason).toBe("holiday");
  });

  it("dia da semana: segunda útil, sábado, domingo", () => {
    expect(dayTypeOf("2026-10-05", EMPTY).dayType).toBe("sunday_holiday"); // segunda, mas 5 de Outubro
    expect(dayTypeOf("2026-10-12", EMPTY)).toEqual({ dayType: "weekday", reason: "weekday" });
    expect(dayTypeOf("2026-10-10", EMPTY)).toEqual({ dayType: "saturday", reason: "weekday" });
    expect(dayTypeOf("2026-10-11", EMPTY)).toEqual({ dayType: "sunday_holiday", reason: "weekday" });
  });
});

describe("hora de relógio em Lisboa (D-093)", () => {
  it("T-29: 25/10/2026, as duas 01:30 dão o minuto 90 e as 03:00 dão 180", () => {
    const first = at("2026-10-25T01:30", "+01:00");
    const second = at("2026-10-25T01:30", "+00:00");
    expect(second - first).toBe(3_600_000);
    expect(lisbonWallClock(first)).toEqual({ date: "2026-10-25", minute: 90 });
    expect(lisbonWallClock(second)).toEqual({ date: "2026-10-25", minute: 90 });
    expect(lisbonWallClock(at("2026-10-25T03:00", "+00:00"))).toEqual({ date: "2026-10-25", minute: 180 });
  });

  it("28/03/2027: depois de 00:59 vem 02:00; a hora que não existe não quebra nada", () => {
    const before = Date.parse("2027-03-28T00:59:00Z");
    expect(lisbonWallClock(before)).toEqual({ date: "2027-03-28", minute: 59 });
    expect(lisbonWallClock(before + 60_000)).toEqual({ date: "2027-03-28", minute: 120 });
    const days = serviceDaysAt(before + 60_000, EMPTY);
    expect(days.today).toMatchObject({ date: "2027-03-28", minute: 120 });
    expect(days.yesterday).toMatchObject({ date: "2027-03-27", minute: 1560 });
  });

  it("bate com o Intl do Node, de 2026 a 2030 (a cada 37 min e minuto a minuto nas mudanças)", () => {
    const intl = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const expected = (ms: number) => {
      const p = Object.fromEntries(intl.formatToParts(ms).map((x) => [x.type, x.value]));
      return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
    };
    const instants: number[] = [];
    for (let ms = Date.parse("2026-01-01T00:00:00Z"); ms < Date.parse("2031-01-01T00:00:00Z"); ms += 37 * 60_000) instants.push(ms);
    for (const day of ["2026-03-29", "2026-10-25", "2027-03-28", "2027-10-31", "2028-03-26", "2028-10-29", "2029-03-25", "2029-10-28", "2030-03-31", "2030-10-27"]) {
      const start = Date.parse(`${day}T00:00:00Z`);
      for (let m = 0; m < 180; m++) instants.push(start + m * 60_000, start + m * 60_000 + 59_999);
    }
    const wrong = instants.filter((ms) => JSON.stringify(lisbonWallClock(ms)) !== JSON.stringify(expected(ms)));
    expect(wrong.map((ms) => new Date(ms).toISOString())).toEqual([]);
    expect(instants.length).toBeGreaterThan(70_000);
  });
});

describe("dia e minuto de serviço (§3.3)", () => {
  it("T-28: domingo 00:10 olha sábado no minuto 1450 e domingo no minuto 10, cada um com o seu tipo", () => {
    const days = serviceDaysAt(at("2026-10-11T00:10", "+01:00"), EMPTY);
    expect(days.today).toEqual({ date: "2026-10-11", minute: 10, dayType: { dayType: "sunday_holiday", reason: "weekday" } });
    expect(days.yesterday).toEqual({ date: "2026-10-10", minute: 1450, dayType: { dayType: "saturday", reason: "weekday" } });
  });

  it("T-09 e T-28: a viagem '00:00' de sábado é das 24:00 do sábado e passou há 10 min", () => {
    const { yesterday } = serviceDaysAt(at("2026-10-11T00:10", "+01:00"), EMPTY);
    const running = tripsRunningOn(yesterday.date, yesterday.dayType.dayType, lineA).map((t) => t.id);
    expect(running).toEqual(["a-sab-2400"]);
    const serviceMinute = 1440; // como o seed grava a "00:00" da tabela de sábado
    expect(formatServiceMinute(serviceMinute)).toBe("24:00");
    expect(yesterday.minute - serviceMinute).toBe(10);
  });

  it("a madrugada depois de um feriado usa o tipo do feriado", () => {
    const { yesterday } = serviceDaysAt(at("2026-05-23T00:30", "+01:00"), LEIRIA);
    expect(yesterday.dayType).toMatchObject({ dayType: "sunday_holiday", reason: "holiday" });
  });

  it("virada de ano: 01/01 00:05 olha 31/12 no minuto 1445", () => {
    expect(serviceDaysAt(at("2027-01-01T00:05", "+00:00"), EMPTY).yesterday).toMatchObject({ date: "2026-12-31", minute: 1445 });
  });
});

describe("quais viagens circulam (§3.4)", () => {
  it("T-10: L9 num dia útil de agosto não tem viagem nenhuma, motivo época", () => {
    expect(tripsRunningOn("2026-08-12", "weekday", line9)).toEqual([]);
    expect(lineServiceOn("2026-08-12", EMPTY, line9)).toMatchObject({ status: "none", reason: "epoca" });
  });

  it("tabela fora de vigência não entra; valid_to vazio fica aberto", () => {
    const data: ScheduleData = {
      seasons: [],
      timetables: [
        { id: "old", validFrom: "2025-09-01", validTo: "2026-08-31" },
        { id: "new", validFrom: "2026-09-01", validTo: null },
      ],
      trips: [
        { id: "old-trip", timetableId: "old", dayTypes: ["weekday"], seasonId: null },
        { id: "new-trip", timetableId: "new", dayTypes: ["weekday"], seasonId: null },
      ],
    };
    expect(tripsRunningOn("2026-08-31", "weekday", data).map((t) => t.id)).toEqual(["old-trip"]);
    expect(tripsRunningOn("2026-09-01", "weekday", data).map((t) => t.id)).toEqual(["new-trip"]);
    expect(tripsRunningOn("2035-01-02", "weekday", data).map((t) => t.id)).toEqual(["new-trip"]);
    expect(tripsRunningOn("2026-08-30", "weekday", { ...data, timetables: [data.timetables[1]!] })).toEqual([]);
  });

  it("viagem apagada não circula", () => {
    const data = { ...lineA, trips: lineA.trips.map((t) => (t.id === "a-util-0640" ? { ...t, deletedAt: 1 } : t)) };
    expect(tripsRunningOn("2026-10-12", "weekday", data)).toEqual([]);
  });

  it("época com virada de ano (15/12 a 15/01) tira as duas pontas e deixa o meio do ano", () => {
    const winter = { id: "w", startMd: "12-15", endMd: "01-15", mode: "exclude" as const };
    const data: ScheduleData = { timetables: [TT], seasons: [winter], trips: [{ id: "t", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: "w" }] };
    expect(tripsRunningOn("2026-12-15", "weekday", data)).toEqual([]);
    expect(tripsRunningOn("2027-01-15", "weekday", data)).toEqual([]);
    expect(tripsRunningOn("2027-01-18", "weekday", data)).toHaveLength(1);
    expect(tripsRunningOn("2026-12-14", "weekday", data)).toHaveLength(1);
  });

  it("época: 30/06 e 01/09 circulam; 01/07 e 31/08 não", () => {
    expect(tripsRunningOn("2026-06-30", "weekday", line9)).toHaveLength(2);
    expect(tripsRunningOn("2026-07-01", "weekday", line9)).toHaveLength(0);
    expect(tripsRunningOn("2026-08-31", "weekday", line9)).toHaveLength(0);
    expect(tripsRunningOn("2026-09-01", "weekday", line9)).toHaveLength(2);
  });
});

describe("por que não circula e o próximo dia (§4.2, T-32)", () => {
  it("T-32: Campus no domingo → sem tabela de domingo, volta na segunda", () => {
    expect(lineServiceOn("2026-10-11", EMPTY, lineCampus)).toEqual({ status: "none", reason: "sem_tabela", nextServiceDate: "2026-10-12" });
  });

  it("T-32: L9 no sábado → só dias úteis, volta na segunda", () => {
    expect(lineServiceOn("2026-10-10", EMPTY, line9)).toEqual({ status: "none", reason: "so_dias_uteis", nextServiceDate: "2026-10-12" });
  });

  it("T-32: L9 em 12/08 → época, volta em 01/09", () => {
    expect(lineServiceOn("2026-08-12", EMPTY, line9)).toEqual({ status: "none", reason: "epoca", nextServiceDate: "2026-09-01" });
  });

  it("feriado numa sexta: L9 → feriado, e o próximo dia útil pula o fim de semana", () => {
    expect(lineServiceOn("2026-05-22", LEIRIA, line9)).toEqual({ status: "none", reason: "feriado", nextServiceDate: "2026-05-25" });
  });

  it("feriado num domingo não é motivo: a L9 já não circularia", () => {
    // 01/11/2026 é domingo e feriado nacional.
    expect(lineServiceOn("2026-11-01", EMPTY, line9)).toMatchObject({ reason: "so_dias_uteis", nextServiceDate: "2026-11-02" });
  });

  it("o próximo dia pula feriados: L9 na véspera de 25/12 de 2026 (sexta) volta na segunda 28", () => {
    expect(lineServiceOn("2026-12-25", EMPTY, line9)).toMatchObject({ reason: "feriado", nextServiceDate: "2026-12-28" });
  });

  it("linha sem tabela em vigência: sem tabela e sem próximo dia", () => {
    const data = { ...line9, timetables: [{ ...TT, validTo: "2026-09-30" }] };
    expect(lineServiceOn("2026-10-12", EMPTY, data)).toEqual({ status: "none", reason: "sem_tabela", nextServiceDate: null });
  });

  it("com serviço devolve as viagens", () => {
    expect(lineServiceOn("2026-10-12", EMPTY, lineA)).toEqual({ status: "running", trips: [lineA.trips[0]] });
  });
});

it("addDays atravessa meses e anos", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
});
