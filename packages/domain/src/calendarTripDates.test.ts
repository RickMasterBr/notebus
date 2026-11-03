import { describe, expect, it } from "vitest";
import { lineServiceOn, tripsRunningOn, type CalendarData, type ScheduleData, type ScheduleTrip } from "./calendar.ts";

// Dados inventados (D-091). 25/12/2026 é sexta e feriado nacional (tipo sunday_holiday); 24/12 é quinta.
const EMPTY: CalendarData = { overrides: [], holidays: [] };
const SUMMER = { id: "season-summer", startMd: "07-01", endMd: "08-31", mode: "exclude" as const };
const TT = { id: "tt-1", validFrom: "2026-01-01", validTo: null };

const trip = (id: string, extra: Partial<ScheduleTrip>): ScheduleTrip => ({
  id,
  timetableId: "tt-1",
  dayTypes: ["sunday_holiday"],
  seasonId: null,
  ...extra,
});
const data = (trips: ScheduleTrip[]): ScheduleData => ({ timetables: [TT], seasons: [SUMMER], trips });
const ids = (date: string, dayType: Parameters<typeof tripsRunningOn>[1], d: ScheduleData) =>
  tripsRunningOn(date, dayType, d).map((t) => t.id);

describe("notOn e alsoOn em tripsRunningOn", () => {
  const dom = data([trip("dom", { notOn: ["2026-12-25"] })]);

  it("notOn tira a viagem na data e só nela", () => {
    expect(ids("2026-12-25", "sunday_holiday", dom)).toEqual([]);
    expect(ids("2026-12-20", "sunday_holiday", dom)).toEqual(["dom"]);
    expect(ids("2026-12-27", "sunday_holiday", dom)).toEqual(["dom"]);
  });

  it("alsoOn faz circular fora do tipo de dia", () => {
    const d = data([trip("so-dom", { alsoOn: ["2026-12-24"] })]);
    expect(ids("2026-12-24", "weekday", d)).toEqual(["so-dom"]);
    expect(ids("2026-12-23", "weekday", d)).toEqual([]);
  });

  it("alsoOn respeita a vigência do quadro", () => {
    const d = data([trip("so-dom", { alsoOn: ["2025-12-31"] })]);
    expect(ids("2025-12-31", "weekday", d)).toEqual([]);
  });

  it("alsoOn ignora a época que exclui a data", () => {
    const d = data([trip("verao", { dayTypes: ["weekday"], seasonId: SUMMER.id, alsoOn: ["2026-07-15"] })]);
    expect(ids("2026-07-15", "weekday", d)).toEqual(["verao"]);
    expect(ids("2026-07-16", "weekday", d)).toEqual([]);
  });

  it("viagem apagada não circula nem com alsoOn", () => {
    const d = data([trip("apagada", { deletedAt: 1, alsoOn: ["2026-12-24"] })]);
    expect(ids("2026-12-24", "weekday", d)).toEqual([]);
  });

  it("sem notOn nem alsoOn o resultado é o de sempre", () => {
    const d = data([trip("dom", {}), trip("util", { dayTypes: ["weekday"], seasonId: SUMMER.id })]);
    expect(ids("2026-12-27", "sunday_holiday", d)).toEqual(["dom"]);
    expect(ids("2026-12-23", "weekday", d)).toEqual(["util"]);
    expect(ids("2026-07-15", "weekday", d)).toEqual([]);
  });
});

describe("motivo data_sem_servico", () => {
  const dom = data([trip("dom", { notOn: ["2026-12-25"] })]);

  it("25/12 devolve data_sem_servico e o próximo domingo", () => {
    expect(lineServiceOn("2026-12-25", EMPTY, dom)).toEqual({ status: "none", reason: "data_sem_servico", nextServiceDate: "2026-12-27" });
  });

  it("data que a época já exclui continua epoca", () => {
    const d = data([trip("util", { dayTypes: ["weekday"], seasonId: SUMMER.id, notOn: ["2026-07-15"] })]);
    expect(lineServiceOn("2026-07-15", EMPTY, d)).toMatchObject({ status: "none", reason: "epoca" });
  });

  it("notOn de outra data não muda feriado, so_dias_uteis nem sem_tabela", () => {
    const util = data([trip("util", { dayTypes: ["weekday"], notOn: ["2026-12-30"] })]);
    expect(lineServiceOn("2026-12-25", EMPTY, util)).toMatchObject({ reason: "feriado" });
    expect(lineServiceOn("2026-12-19", EMPTY, util)).toMatchObject({ reason: "so_dias_uteis" });
    expect(lineServiceOn("2025-06-07", EMPTY, util)).toMatchObject({ reason: "sem_tabela" });
  });
});
