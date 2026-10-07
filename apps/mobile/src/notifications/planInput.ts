/**
 * A entrada do planejador do aviso a partir do banco (E-06 §3.2): as opções de ônibus com o código da linha e o nome do
 * ponto, e o `dayData` de cada dia. Reaproveita `buildGotoInputFromSources` (o mesmo `BusOption` da TL-04 e do
 * "sair às"); nenhuma regra é repetida aqui.
 */
import { dayTypeOf, excludedBySeason, tripsRunningOn, type AlarmDayData, type AlarmOption } from "@notebus/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { buildGotoInputFromSources } from "../data/gotoData";
import { passageRecords } from "../data/records";
import type { ScheduleSnapshot } from "../data/schedule";
import { selectLive } from "../db/query";
import { observation, option, ride, route, walkTime } from "../db/schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

/** O que o texto e o tratador precisam de uma opção, além do `AlarmOption` do domínio. */
export interface AlarmOptionMeta {
  stopId: string;
  lineId: string;
  /** O lugar de destino do trajeto da opção. */
  placeId: string;
}

export interface AlarmPlanContext {
  options: AlarmOption[];
  meta: Map<string, AlarmOptionMeta>;
  dayData: (serviceDate: string) => AlarmDayData;
}

/**
 * Opção sem linha, sem ponto de embarque ou sem nome do ponto fica de fora (não se inventa dado); um aviso que aponta
 * para uma opção que não existe mais (apagada, ou backup de outro aparelho) é ignorado pelo planejador, sem erro.
 */
export async function alarmPlanInput(db: AnyDb, schedule: ScheduleSnapshot, now: number): Promise<AlarmPlanContext> {
  const [routes, options, walkTimes, observations, rides] = await Promise.all([
    selectLive(db, route),
    selectLive(db, option),
    selectLive(db, walkTime),
    selectLive(db, observation),
    selectLive(db, ride),
  ]);

  const alarmOptions: AlarmOption[] = [];
  const meta = new Map<string, AlarmOptionMeta>();
  let validFrom: (tripId: string) => string | null = () => null;
  const orderedRoutes = [...routes].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of orderedRoutes) {
    const input = buildGotoInputFromSources({ route: r, options, walkTimes, observations, rides, schedule }, now);
    if (!input) continue;
    validFrom = input.validFrom;
    for (const bus of input.busOptions) {
      const lineCode = schedule.patternLine.get(bus.pattern.id)?.code;
      const lineId = schedule.patternLineId.get(bus.pattern.id);
      const stopId = bus.pattern.stops.find((s) => s.position === bus.boardPosition)?.stopId;
      const stopName = stopId === undefined ? undefined : schedule.stopNames.get(stopId);
      if (!lineCode || !lineId || !stopId || !stopName) continue;
      alarmOptions.push({ ...bus, lineCode, boardStopName: stopName });
      meta.set(bus.id, { stopId, lineId, placeId: r.destinationPlaceId });
    }
  }

  const records = passageRecords(observations, schedule);
  const dayData = (date: string): AlarmDayData => {
    const dayType = dayTypeOf(date, schedule.calendar);
    const running = new Set(tripsRunningOn(date, dayType.dayType, schedule.schedule).map((t) => t.id));
    return {
      trips: schedule.trips.filter((t) => running.has(t.id)),
      records,
      dayType,
      validFrom,
      seasonExcluded: excludedBySeason(date, dayType.dayType, schedule.schedule),
    };
  };
  return { options: alarmOptions, meta, dayData };
}
