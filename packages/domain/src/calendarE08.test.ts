import { describe, expect, it } from "vitest";
import { type CalendarData, dayTypeOf } from "./calendar.ts";

// E-08 (D-114): o interruptor dos municipais, o feriado que repete e o feriado do usuário. Exemplo inventado (D-091).
// Dias da semana conferidos: 24/12/2026 qui; 03/03/2027 qua; 03/03/2028 sex; 10/04/2027 sáb; 10/04/2028 seg;
// 22/05/2026 sex; 22/05/2027 sáb; 29/02/2028 ter.

const MUNICIPAL = [2026, 2027, 2028].map((y) => ({ date: `${y}-05-22`, name: "Feriado municipal de Leiria", scope: "municipal" as const, recurring: false }));
const TRES_DE_MARCO = { date: "2026-03-03", name: "3 de março", scope: "manual" as const, recurring: true };
const DEZ_DE_ABRIL = { date: "2027-04-10", name: "10 de abril", scope: "manual" as const, recurring: false };
const BISSEXTO = { date: "2024-02-29", name: "Dia bissexto", scope: "manual" as const, recurring: true };

const calendar = (extra: Partial<CalendarData> = {}): CalendarData => ({
  overrides: [],
  holidays: [...MUNICIPAL, TRES_DE_MARCO, DEZ_DE_ABRIL, BISSEXTO],
  ...extra,
});

describe("T-81: feriado do usuário que repete", () => {
  it("'3 de março' que repete vale em 03/03/2027 (quarta) e 03/03/2028 (sexta), com o nome", () => {
    for (const date of ["2027-03-03", "2028-03-03"]) {
      expect([date, dayTypeOf(date, calendar())]).toEqual([date, { dayType: "sunday_holiday", reason: "holiday", holidayName: "3 de março" }]);
    }
  });

  it("a data original também vale, e o dia seguinte não", () => {
    expect(dayTypeOf("2026-03-03", calendar())).toMatchObject({ reason: "holiday" });
    expect(dayTypeOf("2027-03-04", calendar())).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("sem repetição: 10/04/2027 (sábado) vale; 10/04/2028 (segunda) não", () => {
    expect(dayTypeOf("2027-04-10", calendar())).toEqual({ dayType: "sunday_holiday", reason: "holiday", holidayName: "10 de abril" });
    expect(dayTypeOf("2028-04-10", calendar())).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("29/02 que repete vale em 29/02/2028 e não vira 28/02 nem 01/03 em 2027", () => {
    expect(dayTypeOf("2028-02-29", calendar())).toMatchObject({ reason: "holiday", holidayName: "Dia bissexto" });
    expect(dayTypeOf("2027-02-28", calendar())).toEqual({ dayType: "sunday_holiday", reason: "weekday" });
    expect(dayTypeOf("2027-03-01", calendar())).toEqual({ dayType: "weekday", reason: "weekday" });
  });
});

describe("T-81: interruptor dos feriados municipais", () => {
  it("ligado (ou ausente), 22/05/2027 (sábado) é feriado; desligado, é sábado comum", () => {
    const holiday = { dayType: "sunday_holiday", reason: "holiday", holidayName: "Feriado municipal de Leiria" };
    expect(dayTypeOf("2027-05-22", calendar())).toEqual(holiday);
    expect(dayTypeOf("2027-05-22", calendar({ includeMunicipal: true }))).toEqual(holiday);
    expect(dayTypeOf("2027-05-22", calendar({ includeMunicipal: false }))).toEqual({ dayType: "saturday", reason: "weekday" });
  });

  it("22/05/2026 (sexta) desligado volta a ser dia útil", () => {
    expect(dayTypeOf("2026-05-22", calendar({ includeMunicipal: false }))).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("com o interruptor desligado, os dois feriados do usuário continuam valendo", () => {
    const off = calendar({ includeMunicipal: false });
    expect(dayTypeOf("2027-03-03", off)).toMatchObject({ reason: "holiday", holidayName: "3 de março" });
    expect(dayTypeOf("2027-04-10", off)).toMatchObject({ reason: "holiday", holidayName: "10 de abril" });
  });

  it("um feriado nacional (25/12/2026) não muda com o interruptor", () => {
    for (const includeMunicipal of [true, false]) {
      expect(dayTypeOf("2026-12-25", calendar({ includeMunicipal }))).toMatchObject({ dayType: "sunday_holiday", reason: "holiday" });
    }
  });

  it("municipal e manual na mesma data: o nome mostrado é o do manual (nas duas ordens); desligado, só o manual", () => {
    const manual = { date: "2026-05-22", name: "Meu feriado", scope: "manual" as const, recurring: false };
    const municipal = MUNICIPAL[0]!;
    for (const holidays of [[municipal, manual], [manual, municipal]]) {
      expect(dayTypeOf("2026-05-22", { overrides: [], holidays })).toMatchObject({ holidayName: "Meu feriado" });
      expect(dayTypeOf("2026-05-22", { overrides: [], holidays, includeMunicipal: false })).toMatchObject({ holidayName: "Meu feriado" });
    }
  });
});

describe("T-80 (domínio): a exceção vence o feriado", () => {
  it("exceção em 22/05/2026 como sábado vence o feriado municipal", () => {
    expect(dayTypeOf("2026-05-22", calendar({ overrides: [{ date: "2026-05-22", dayType: "saturday" }] }))).toEqual({ dayType: "saturday", reason: "override" });
  });

  it("exceção em 24/12/2026 (quinta) como sábado dá sábado", () => {
    expect(dayTypeOf("2026-12-24", calendar({ overrides: [{ date: "2026-12-24", dayType: "saturday" }] }))).toEqual({ dayType: "saturday", reason: "override" });
    expect(dayTypeOf("2026-12-24", calendar())).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("a exceção vence também o feriado que repete", () => {
    expect(dayTypeOf("2027-03-03", calendar({ overrides: [{ date: "2027-03-03", dayType: "weekday" }] }))).toEqual({ dayType: "weekday", reason: "override" });
  });
});
