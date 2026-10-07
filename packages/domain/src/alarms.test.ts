import { describe, expect, it } from "vitest";
import {
  alarmTextParams,
  applyAlarm,
  buildWindow,
  planDepartures,
  resolveAlarmEventState,
  snoozePlan,
  type AlarmDayData,
  type AlarmOption,
  type AlarmRule,
  type PlannedDeparture,
} from "./alarms.ts";
import { dayTypeOf, excludedBySeason, tripsRunningOn, type CalendarData } from "./calendar.ts";
import { DOMAIN_CONFIG } from "./config.ts";
import type { PassageRecord } from "./passages.ts";
import { formatServiceMinute } from "./serviceMinute.ts";
import { ARRABALDE, NETWORK, P1, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// Aviso de saída (E-06 §3, §6) sobre a rede inventada de `testing/e03Network.ts` (D-091). Os valores esperados são os
// que o domínio calcula, conferidos com a regra ao lado (nunca copiados do plano).
//
// Conta-base: a viagem L1 das 08:10 passa na Arrabalde (pos. 2) às 08:12 (interpolada, ±4). Sem registros: faixa
// 08:08…08:16, esteja lá = 08:08 − 2 (margem) = 08:06; a pé 6 min → sair às 08:00.

const WALK_6 = { min: 6, max: null };
const OPTION: AlarmOption = {
  id: "casa-facul-l1",
  pattern: P1,
  boardPosition: 2,
  alightPosition: 10,
  walkToBoard: WALK_6,
  walkAfterAlight: { min: 5, max: null },
  rideMinutes: [],
  lineCode: "1",
  boardStopName: "Arrabalde da Ponte",
};
const BASE_0812 = hm(8, 12);
const BASE_1012 = hm(10, 12);

const alarm = (over: Partial<AlarmRule> & Pick<AlarmRule, "id">): AlarmRule => ({
  optionId: OPTION.id,
  anchorTripId: tripId(P1, "weekday", hm(8, 10)),
  anchorBaseMinute: BASE_0812,
  weekdays: [1, 3, 5],
  onceDate: null,
  validFrom: "2026-10-01",
  validTo: null,
  enabled: true,
  ...over,
});

interface DayOptions {
  calendar?: CalendarData;
  records?: PassageRecord[];
  /** Datas em que a tabela do dia não tem a viagem de base 08:12 (e o motivo ser a época). */
  withoutTrip?: Record<string, { season: boolean }>;
  /** Trata todo dia como dia útil (para a data de 25/10, um domingo sem viagem na rede inventada). */
  forceWeekdayTrips?: boolean;
}

/** `dayData` como o app o monta: calendário, `tripsRunningOn`, época. */
function dayDataFor(opts: DayOptions = {}): (date: string) => AlarmDayData {
  const calendar = opts.calendar ?? NETWORK.calendar;
  return (date) => {
    const dayType = dayTypeOf(date, calendar);
    const code = opts.forceWeekdayTrips ? "weekday" : dayType.dayType;
    const running = new Set(tripsRunningOn(date, code, NETWORK.schedule).map((t) => t.id));
    const missing = opts.withoutTrip?.[date];
    const trips = NETWORK.trips.filter((t) => running.has(t.id) && !(missing && t.id.endsWith("/0810")));
    return {
      trips,
      records: opts.records ?? [],
      dayType: opts.forceWeekdayTrips ? { ...dayType, dayType: "weekday" } : dayType,
      validFrom: () => VALID_FROM,
      seasonExcluded: missing?.season ?? excludedBySeason(date, code, NETWORK.schedule),
    };
  };
}

const TUE = "2026-10-06"; // terça-feira; segunda 05/10 é feriado nacional (República), quarta 07/10 é dia útil
const NOW = at(TUE, 7, 0);
const plan = (alarms: AlarmRule[], opts: DayOptions = {}, now = NOW) =>
  planDepartures({ alarms, options: [OPTION], now, dayData: dayDataFor(opts) });
const dates = (p: { departures: PlannedDeparture[] }) => p.departures.map((d) => d.serviceDate);

describe("T-53: aviso que repete em seg, qua e sex (âncora 08:12)", () => {
  it("só nos dias escolhidos, cada um com a viagem das 08:10, e sair às 08:00 / esteja lá 08:06 / ônibus 08:12", () => {
    const p = plan([alarm({ id: "A", validTo: "2026-10-16" })]);
    expect(dates(p)).toEqual(["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"]);
    for (const d of p.departures) {
      expect(d.tripId).toBe(tripId(P1, "weekday", hm(8, 10)));
      expect([d.beAtStop, d.busTime]).toEqual([hm(8, 6), hm(8, 12)]);
      // Horário de verão (UTC+1): 08:00 em Lisboa = 07:00 UTC.
      expect(d.leaveAt).toBe(at(d.serviceDate, 8, 0));
    }
    expect(p.skipped).toEqual([]);
  });

  it("feriado municipal e exceção de data pulam com o motivo; o dia sem a viagem pula como no_trip e a época como season", () => {
    const calendar: CalendarData = {
      holidays: [{ date: "2026-10-14", name: "Feriado inventado" }],
      overrides: [{ date: "2026-10-16", dayType: "saturday" }],
    };
    const p = plan([alarm({ id: "A" })], {
      calendar,
      withoutTrip: { "2026-10-12": { season: false }, "2026-10-19": { season: true } },
    });
    expect(dates(p)).toEqual(["2026-10-07", "2026-10-09"]);
    expect(p.skipped).toEqual([
      { alarmId: "A", serviceDate: "2026-10-12", reason: "no_trip" },
      { alarmId: "A", serviceDate: "2026-10-14", reason: "holiday" },
      { alarmId: "A", serviceDate: "2026-10-16", reason: "override" },
      { alarmId: "A", serviceDate: "2026-10-19", reason: "season" },
    ]);
  });

  it("o aviso de uma data só não pula por feriado (foi você que o pediu)", () => {
    const calendar: CalendarData = { holidays: [{ date: "2026-10-14", name: "Feriado inventado" }], overrides: [] };
    const p = plan([alarm({ id: "A", weekdays: [], onceDate: "2026-10-14" })], { calendar, forceWeekdayTrips: true });
    expect(dates(p)).toEqual(["2026-10-14"]);
    expect(p.skipped).toEqual([]);
  });

  it("o horário esperado é o de cada dia: um registro de atraso muda o 'sair às'", () => {
    const record: PassageRecord = {
      deviation: 6,
      observedAt: at("2026-10-05", 8, 20),
      serviceDate: "2026-10-05",
      dayType: "weekday",
      tripId: tripId(P1, "weekday", hm(8, 10)),
      patternId: P1.id,
      position: 2,
      stopId: ARRABALDE,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };
    const [d] = plan([alarm({ id: "A" })], { records: [record] }).departures;
    // Um registro, +6, nos três níveis: centro = (1·6 + 3·6)/(1+3) = +6 → ônibus ~08:18; faixa 6−4…6+4 = 08:14…08:22;
    // esteja lá = 08:14 − 2 (margem) = 08:12; a pé 6 → sair às 08:06 (sem registro seria 08:00).
    expect(d!.busTime).toBe(hm(8, 18));
    expect(d!.beAtStop).toBe(hm(8, 12));
    expect(d!.leaveAt).toBe(at(d!.serviceDate, 8, 6));
  });

  it("25/10/2026 (fim do horário de verão): a hora certa, 08:00 em Lisboa = 08:00 UTC (nos outros dias, 07:00 UTC)", () => {
    const now = at("2026-10-22", 7, 0);
    const p = plan([alarm({ id: "A", weekdays: [], onceDate: "2026-10-25" }), alarm({ id: "B", weekdays: [], onceDate: "2026-10-23" }), alarm({ id: "C", weekdays: [], onceDate: "2026-10-26" })], { forceWeekdayTrips: true }, now);
    const by = Object.fromEntries(p.departures.map((d) => [d.alarmId, d.leaveAt]));
    expect(by.A).toBe(Date.UTC(2026, 9, 25, 8, 0));
    expect(by.B).toBe(Date.UTC(2026, 9, 23, 7, 0));
    expect(by.C).toBe(Date.UTC(2026, 9, 26, 8, 0));
  });

  it("descarta a saída que já passou, comparando ao minuto: 08:00 às 08:00 ainda vale, às 08:01 sai", () => {
    const wed = "2026-10-07";
    const one = (now: number) => plan([alarm({ id: "A", weekdays: [], onceDate: wed })], {}, now);
    expect(one(at(wed, 8, 0, 59)).departures).toHaveLength(1);
    expect(one(at(wed, 8, 1)).departures).toHaveLength(0);
  });

  it("aviso desligado, de opção desconhecida ou fora do intervalo não gera nem pula", () => {
    const p = plan([
      alarm({ id: "off", enabled: false }),
      alarm({ id: "ghost", optionId: "outra" }),
      alarm({ id: "late", validFrom: "2026-11-01" }),
    ]);
    expect(p).toEqual({ departures: [], skipped: [] });
  });

  it("o horizonte é de 14 dias (hoje até hoje + 14) e vem em ordem de leaveAt", () => {
    const p = plan([alarm({ id: "A", weekdays: [0, 1, 2, 3, 4, 5, 6] })], { forceWeekdayTrips: true });
    expect(dates(p)[0]).toBe("2026-10-06"); // hoje (terça), 08:00 ainda não passou
    expect(dates(p).at(-1)).toBe("2026-10-20");
    expect(p.departures.map((d) => d.leaveAt)).toEqual([...p.departures.map((d) => d.leaveAt)].sort((a, b) => a - b));
  });

  it("é puro e idempotente: mesma entrada, mesma saída, com ou sem a ordem dos avisos trocada", () => {
    const a = alarm({ id: "A" });
    const b = alarm({ id: "B", anchorBaseMinute: BASE_1012, weekdays: [2, 4] });
    expect(plan([a, b])).toEqual(plan([a, b]));
    expect(plan([a, b])).toEqual(plan([b, a]));
  });
});

describe("T-62: intervalo e horários por dia", () => {
  it("valid_to = 31/01/2027: nada depois; sem fim continua (fora do horizonte de 14 dias, com o relógio perto do fim)", () => {
    const now = at("2027-01-27", 7, 0); // quarta
    const bounded = plan([alarm({ id: "A", validTo: "2027-01-31" })], {}, now);
    const open = plan([alarm({ id: "B", validTo: null })], {}, now);
    expect(dates(bounded).at(-1)).toBe("2027-01-29"); // sexta; segunda 01/02 já é depois do fim
    expect(dates(bounded).some((d) => d > "2027-01-31")).toBe(false);
    expect(dates(open)).toContain("2027-02-01");
    expect(bounded.skipped).toEqual([]);
  });

  it("dois avisos: 08:12 em seg qua sex e 10:12 em ter qui, cada dia com o seu horário (sair 08:00 e 10:00)", () => {
    const a = alarm({ id: "A" });
    const b = alarm({ id: "B", anchorTripId: tripId(P1, "weekday", hm(10, 10)), anchorBaseMinute: BASE_1012, weekdays: [2, 4] });
    const p = plan([a, b], {}, at("2026-10-06", 6, 0));
    const first = p.departures.slice(0, 5).map((d) => [d.serviceDate, d.alarmId, d.leaveAt]);
    expect(first).toEqual([
      ["2026-10-06", "B", at("2026-10-06", 10, 0)],
      ["2026-10-07", "A", at("2026-10-07", 8, 0)],
      ["2026-10-08", "B", at("2026-10-08", 10, 0)],
      ["2026-10-09", "A", at("2026-10-09", 8, 0)],
      ["2026-10-12", "A", at("2026-10-12", 8, 0)],
    ]);
    expect(p.departures.filter((d) => d.alarmId === "A").every((d) => d.busTime === hm(8, 12))).toBe(true);
    expect(p.departures.filter((d) => d.alarmId === "B").every((d) => d.busTime === hm(10, 12))).toBe(true);
  });
});

const departureAt = (n: number): PlannedDeparture => ({
  alarmId: `a${n}`,
  optionId: OPTION.id,
  serviceDate: "2026-10-07",
  tripId: "t",
  leaveAt: n * 60_000,
  beAtStop: 486,
  beAtStopAt: n * 60_000 + 360_000,
  busTime: 492,
  lineCode: "1",
  stopName: "Arrabalde da Ponte",
});

describe("T-51 e T-52: janela de 50", () => {
  const eighty = Array.from({ length: 80 }, (_, i) => departureAt(80 - i)); // fora de ordem

  it("T-51: 80 saídas → as 50 mais próximas; só a última da janela leva renewHint", () => {
    const { window, overflow } = buildWindow(eighty);
    expect(overflow).toBe(true);
    expect(window).toHaveLength(DOMAIN_CONFIG.alarmWindowSize);
    expect(window.map((d) => d.leaveAt)).toEqual(Array.from({ length: 50 }, (_, i) => (i + 1) * 60_000));
    expect(window.filter((d) => d.renewHint).map((d) => d.alarmId)).toEqual(["a50"]);
  });

  it("T-51: exatamente 50 ou menos → sem overflow e nenhuma marcada", () => {
    const { window, overflow } = buildWindow(eighty.slice(0, 50));
    expect(overflow).toBe(false);
    expect(window.some((d) => d.renewHint)).toBe(false);
    expect(buildWindow([]).window).toEqual([]);
  });

  it("T-52 (parte pura): planejar e montar a janela duas vezes dá o mesmo resultado, com a ordem dos avisos trocada", () => {
    const alarms = [1, 2, 3, 4, 5, 6, 7].map((n) => alarm({ id: `A${n}`, weekdays: [0, 1, 2, 3, 4, 5, 6], anchorBaseMinute: hm(8, 12) }));
    const run = (list: AlarmRule[]) => buildWindow(plan(list, { forceWeekdayTrips: true }).departures);
    const first = run(alarms);
    expect(run(alarms)).toEqual(first);
    expect(run([...alarms].reverse())).toEqual(first);
    // 7 avisos iguais × 15 dias = 105 saídas (menos as de hoje já passadas): passa de 50.
    expect(first.overflow).toBe(true);
    expect(first.window).toHaveLength(50);
  });

  it("duas saídas do mesmo instante ficam as duas", () => {
    const { window } = buildWindow([departureAt(5), { ...departureAt(5), alarmId: "b" }]);
    expect(window.map((d) => d.alarmId)).toEqual(["a5", "b"]);
  });
});

describe("T-54: parâmetros do texto", () => {
  it("L1 às ~08:13 na Arrabalde, esteja lá 08:06,5 → 08:06 (para baixo, D-092); o ônibus arredonda (492,5 → 493)", () => {
    const record: PassageRecord = {
      deviation: 0.5,
      observedAt: at("2026-10-05", 8, 20),
      serviceDate: "2026-10-05",
      dayType: "weekday",
      tripId: tripId(P1, "weekday", hm(8, 10)),
      patternId: P1.id,
      position: 2,
      stopId: ARRABALDE,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };
    // Base 492 (08:12) + 0,5 = centro 492,5; faixa 0,5−4 … 0,5+4 → começa 488,5; menos a margem 2 = 486,5 = 08:06,5.
    const [d] = plan([alarm({ id: "A" })], { records: [record] }).departures;
    expect(alarmTextParams(d!)).toEqual({ line: "1", time: "08:13", stopName: "Arrabalde da Ponte", arriveTime: "08:06" });
  });

  it("sem registros: Linha 1 às 08:12, esteja lá às 08:06", () => {
    const [d] = plan([alarm({ id: "A" })]).departures;
    expect(alarmTextParams(d!)).toEqual({ line: "1", time: "08:12", stopName: "Arrabalde da Ponte", arriveTime: "08:06" });
  });
});

describe("T-56: Adiar 5 min (parte pura)", () => {
  const beAt = at("2026-10-07", 8, 6);
  it("antes do 'esteja no ponto às': +5 min e afterStop falso", () => {
    expect(snoozePlan(at("2026-10-07", 7, 59), beAt)).toEqual({ at: at("2026-10-07", 8, 4), afterStop: false });
  });
  it("o novo aviso cai exatamente no limite: ainda não passa", () => {
    expect(snoozePlan(at("2026-10-07", 8, 1), beAt)).toEqual({ at: beAt, afterStop: false });
  });
  it("depois do limite: afterStop verdadeiro (o corpo avisa que chega depois)", () => {
    expect(snoozePlan(at("2026-10-07", 8, 2), beAt)).toEqual({ at: at("2026-10-07", 8, 7), afterStop: true });
  });
});

describe("T-58: estados do histórico", () => {
  const base = { plannedAt: 1000, now: 2000, action: null, inTray: false, skipReason: null } as const;
  const state = (over: Partial<Parameters<typeof resolveAlarmEventState>[0]>) => resolveAlarmEventState({ ...base, ...over });

  it("na central → entregue; apagado sem toque → sem confirmação", () => {
    expect(state({ inTray: true }).state).toBe("delivered");
    expect(state({ inTray: false }).state).toBe("unconfirmed");
  });
  it("ação do botão → registrou, adiado, dispensado (mesmo com o aviso na central)", () => {
    expect(state({ action: "boarded", inTray: true }).state).toBe("boarded");
    expect(state({ action: "snoozed" }).state).toBe("snoozed");
    expect(state({ action: "dismissed" }).state).toBe("dismissed");
  });
  it("planejado no futuro → agendado", () => {
    expect(state({ plannedAt: 3000 }).state).toBe("scheduled");
    expect(state({ plannedAt: 2000 }).state).toBe("unconfirmed");
  });
  it("pulado vence tudo, com o motivo", () => {
    expect(state({ skipReason: "holiday", action: "boarded", inTray: true, plannedAt: 3000 })).toEqual({ state: "skipped", skipReason: "holiday" });
  });
});

describe("T-61: um aviso por opção e por dia (D-105)", () => {
  const A = alarm({ id: "A", weekdays: [1, 3, 5] });
  const B = alarm({ id: "B", weekdays: [1, 2] });

  it("B (seg e ter) substitui A na segunda; A fica quarta e sexta; B vale seg e ter", () => {
    const { next, replaced } = applyAlarm([A], B);
    expect(next.map((r) => [r.id, r.weekdays, r.enabled])).toEqual([["A", [3, 5], true], ["B", [1, 2], true]]);
    expect(replaced).toEqual([{ alarmId: "A", weekdays: [1] }]);
  });

  it("Desfazer devolve o que existia, exatamente igual, e não mexe na entrada", () => {
    const existing = [A];
    const snapshot = JSON.stringify(existing);
    const { undo } = applyAlarm(existing, B);
    expect(undo()).toEqual([A]);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it("aviso que perde todos os dias é desativado, não apagado; o desfazer o devolve", () => {
    const { next, replaced, undo } = applyAlarm([A], alarm({ id: "C", weekdays: [1, 3, 5, 6] }));
    expect(next.find((r) => r.id === "A")).toMatchObject({ enabled: false, weekdays: [] });
    expect(replaced).toEqual([{ alarmId: "A", weekdays: [1, 3, 5] }]);
    expect(undo()).toEqual([A]);
  });

  it("outra opção, ou sem dia em comum, ou aviso desligado, não é tocado", () => {
    expect(applyAlarm([A], alarm({ id: "X", optionId: "outra", weekdays: [1] })).replaced).toEqual([]);
    expect(applyAlarm([A], alarm({ id: "X", weekdays: [2, 4] })).replaced).toEqual([]);
    expect(applyAlarm([A], alarm({ id: "X", weekdays: [1], enabled: false })).replaced).toEqual([]);
    expect(applyAlarm([{ ...A, enabled: false }], B).replaced).toEqual([]);
  });

  it("aviso de data única substitui só o da mesma opção e da mesma data", () => {
    const once = (id: string, onceDate: string) => alarm({ id, weekdays: [], onceDate });
    const { next, replaced } = applyAlarm([once("O1", "2026-10-07"), once("O2", "2026-10-08"), A], once("N", "2026-10-07"));
    expect(next.map((r) => [r.id, r.enabled])).toEqual([["O1", false], ["O2", true], ["A", true], ["N", true]]);
    expect(replaced).toEqual([{ alarmId: "O1", weekdays: [], onceDate: "2026-10-07" }]);
  });

  it("editar o próprio aviso (mesmo id) troca o existente e não substitui a si mesmo", () => {
    const { next, replaced } = applyAlarm([A], { ...A, weekdays: [1, 2] });
    expect(next.map((r) => [r.id, r.weekdays])).toEqual([["A", [1, 2]]]);
    expect(replaced).toEqual([]);
  });
});
