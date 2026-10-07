/**
 * O agendador do aviso de saída (E-06 §3.2, T-51, T-52): recalcula as saídas, apaga **todos** os pendentes do NoteBus e
 * recria a janela de no máximo 50 (o iOS guarda 64). Idempotente: rodar duas vezes dá o mesmo conjunto.
 * Aviso real usa sempre o relógio real (`now` vem do chamador, que passa `realNow`; o relógio de teste nunca entra aqui).
 */
import {
  alarmTextParams,
  buildWindow,
  formatServiceMinute,
  lisbonInstants,
  lisbonWallClock,
  planDepartures,
  type PlannedDeparture,
  type WindowDeparture,
} from "@notebus/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { loadSchedule as loadScheduleFromDb, type ScheduleSnapshot } from "../data/schedule";
import { ruleOf, sharedAlarms, type PlannedEventInput } from "../db/alarms";
import { t } from "../i18n";
import { DEPARTURE_CATEGORY } from "./categories";
import { departureData, type DeparturePayload } from "./payload";
import { alarmPlanInput, type AlarmPlanContext } from "./planInput";
import type { NotificationsPort, ScheduledRequest } from "./port";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface SchedulerDeps {
  port: NotificationsPort;
  db: AnyDb;
  /** O relógio real (`realNow`). */
  now: () => number;
  /** Os testes podem injetar o horário já carregado. */
  loadSchedule?: (db: AnyDb) => Promise<ScheduleSnapshot>;
}

export type RescheduleResult = { ok: true; scheduled: number } | { ok: false; reason: "permission_denied" };
export type TestAlarmResult = { ok: true; at: number; eventId: string } | { ok: false; reason: "permission_denied" | "no_option" };

const MINUTE_MS = 60_000;
/** Fora do `skipped` do dia, a hora planejada de uma linha pulada é o começo do dia. */
const dayStart = (date: string) => lisbonInstants(date, 0)[0] ?? 0;

export const eventIdOf = (alarmId: string, serviceDate: string) => `${alarmId}:${serviceDate}`;
export const snoozeIdOf = (eventId: string) => `${eventId}:snooze`;
export const isTestEvent = (eventId: string) => eventId.startsWith("test:");

/** O texto do aviso (`notif.title` e `notif.body`); `renew` acrescenta a linha da última da janela. */
export function departureText(p: Pick<DeparturePayload, "lineCode" | "busTime" | "stopName" | "arriveTime">, extra: { renew?: boolean; afterStop?: boolean } = {}) {
  const body = t("notif.body", { line: p.lineCode, time: p.busTime, stop_name: p.stopName, arrive_time: p.arriveTime });
  const lines = [extra.afterStop ? t("notif.snoozed_body", { stop_time: p.arriveTime }) : body];
  if (extra.renew) lines.push(t("notif.renew"));
  return { title: t("notif.title"), body: lines.join("\n") };
}

let queue: Promise<unknown> = Promise.resolve();

/** Uma chamada por vez no processo inteiro, na ordem em que chegaram; um erro não trava as seguintes. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function createScheduler(deps: SchedulerDeps) {
  const { port, db } = deps;
  const repo = sharedAlarms(db);
  const loadSchedule = deps.loadSchedule ?? loadScheduleFromDb;

  function requestOf(d: WindowDeparture, ctx: AlarmPlanContext): ScheduledRequest {
    const meta = ctx.meta.get(d.optionId)!;
    const params = alarmTextParams(d);
    const id = eventIdOf(d.alarmId, d.serviceDate);
    const payload: DeparturePayload = {
      eventId: id,
      stopId: meta.stopId,
      lineId: meta.lineId,
      tripId: d.tripId,
      beAtStopAt: d.beAtStopAt,
      lineCode: d.lineCode,
      stopName: d.stopName,
      busTime: params.time,
      arriveTime: params.arriveTime,
      placeId: meta.placeId,
      test: false,
    };
    return { id, at: d.leaveAt, ...departureText(payload, { renew: d.renewHint }), categoryId: DEPARTURE_CATEGORY, data: departureData(payload) };
  }

  async function runReschedule(): Promise<RescheduleResult> {
    const now = deps.now();
    if ((await port.getPermission()) !== "granted") {
      await port.cancelAllScheduled();
      return { ok: false, reason: "permission_denied" };
    }
    const schedule = await loadSchedule(db);
    const ctx = await alarmPlanInput(db, schedule, now);
    const alarms = (await repo.listAlarms()).map(ruleOf).filter((a) => a.enabled);
    const plan = planDepartures({ alarms, options: ctx.options, now, dayData: ctx.dayData });
    const { window } = buildWindow(plan.departures);

    // O que o reagendamento não pode apagar: o "Adiar" ainda no futuro e o aviso de teste pendente. Ficam fora dos 50.
    const pending = await port.listScheduled();
    const snoozedIds = new Set(
      (await repo.listEvents()).filter((e) => e.state === "snoozed" && e.snoozedTo !== null && e.snoozedTo > now).map((e) => snoozeIdOf(e.id)),
    );
    const kept = pending.filter((p) => p.at > now && (snoozedIds.has(p.id) || isTestEvent(p.id)));

    await port.cancelAllScheduled();
    const requests = window.map((d) => requestOf(d, ctx));
    // Um instante já passado dentro deste minuto vale "agora" (o iOS não dispara data no passado).
    for (const request of [...requests, ...kept]) await port.scheduleAt({ ...request, at: Math.max(request.at, now + 1000) });

    const planned: PlannedEventInput[] = window.map((d) => plannedEvent(d, "scheduled"));
    const skipped: PlannedEventInput[] = plan.skipped.map((s) => ({
      id: eventIdOf(s.alarmId, s.serviceDate),
      alarmId: s.alarmId,
      plannedAt: dayStart(s.serviceDate),
      serviceDate: s.serviceDate,
      tripId: null,
      state: "skipped",
      skipReason: s.reason,
    }));
    await repo.upsertPlannedEvents([...planned, ...skipped], now);
    return { ok: true, scheduled: requests.length + kept.length };
  }

  function plannedEvent(d: PlannedDeparture, state: "scheduled"): PlannedEventInput {
    return { id: eventIdOf(d.alarmId, d.serviceDate), alarmId: d.alarmId, plannedAt: d.leaveAt, serviceDate: d.serviceDate, tripId: d.tripId, state };
  }

  /** Reagenda a janela. Chame sempre com o relógio real; nunca espere por ele no toque do usuário. */
  const reschedule = (): Promise<RescheduleResult> => enqueue(runReschedule);

  /** Aviso de teste (A3 e A4): 1 minuto depois, com os mesmos botões e a primeira opção de ônibus cadastrada. */
  async function runTestAlarm(): Promise<TestAlarmResult> {
    const now = deps.now();
    if ((await port.getPermission()) !== "granted") return { ok: false, reason: "permission_denied" };
    const schedule = await loadSchedule(db);
    const ctx = await alarmPlanInput(db, schedule, now);
    const option = ctx.options[0];
    const meta = option ? ctx.meta.get(option.id) : undefined;
    if (!option || !meta) return { ok: false, reason: "no_option" };

    const at = now + MINUTE_MS;
    const eventId = `test:${at}`;
    // O texto de teste mostra o instante do próprio aviso (não depende de haver ônibus naquela hora).
    const shown = formatServiceMinute(lisbonWallClock(at).minute);
    const payload: DeparturePayload = {
      eventId,
      stopId: meta.stopId,
      lineId: meta.lineId,
      tripId: "test",
      beAtStopAt: at + MINUTE_MS * 2,
      lineCode: option.lineCode,
      stopName: option.boardStopName,
      busTime: shown,
      arriveTime: shown,
      placeId: meta.placeId,
      test: true,
    };
    const text = departureText(payload);
    await port.scheduleAt({ id: eventId, at, title: t("notif.test.title"), body: text.body, categoryId: DEPARTURE_CATEGORY, data: departureData(payload) });
    return { ok: true, at, eventId };
  }

  const scheduleTestAlarm = (): Promise<TestAlarmResult> => enqueue(runTestAlarm);

  return { reschedule, scheduleTestAlarm };
}

export type Scheduler = ReturnType<typeof createScheduler>;
