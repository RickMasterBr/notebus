/**
 * Adaptador banco → domínio para "Ir para X" (E-05 §4.2, bloco 2 item 2).
 *
 * Transforma dados do banco (lugares, opções, tempos a pé, registros e viagens realizadas)
 * e o horário carregado (`ScheduleSnapshot`) no `GotoInput` esperado pelo cálculo puro do domínio (`goto.ts`).
 *
 * Regras:
 * - `walkToBoard`: walk_time entre ponto físico do embarque e lugar de origem do trajeto. Par sem walk_time: { min: 0, max: null }.
 * - `walkAfterAlight`: walk_time entre ponto físico da descida e lugar de destino do trajeto. Par sem walk_time: { min: 0, max: null }.
 * - `rideMinutes`: para cada ride fechado cujos embarque e descida foram nas mesmas pattern_stop da opção, diferença em minutos entre descida e embarque (apenas auto ou manual).
 * - `records`: registros da linha via passageRecords.
 * - Dia de serviço: o de hoje no fuso da rede (`lisbonWallClock(now).date`), como na D-158.
 * - Opção a pé vira WalkOption com walkMinutes.
 */
import {
  dayTypeOf,
  displayCenter,
  lisbonWallClock,
  tripsRunningOn,
  type BusOption,
  type DomainConfig,
  type GotoInput,
  type WalkOption,
  type WalkRange,
} from "@notebus/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { selectLive } from "../db/query";
import {
  observation,
  option,
  ride,
  route,
  walkTime,
  type ObservationRow,
  type OptionRow,
  type RideRow,
  type RouteRow,
  type WalkTimeRow,
} from "../db/schema";
import { passageRecords } from "./records";
import type { ScheduleSnapshot } from "./schedule";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface GotoDataSources {
  route: RouteRow;
  options: readonly OptionRow[];
  walkTimes: readonly WalkTimeRow[];
  observations: readonly ObservationRow[];
  rides: readonly RideRow[];
  schedule: ScheduleSnapshot;
}

const DEFAULT_WALK_RANGE: WalkRange = { min: 0, max: null };

function findWalkRange(
  walkTimes: readonly WalkTimeRow[],
  stopId: string,
  placeId: string,
): WalkRange {
  const wt = walkTimes.find(
    (w) => w.stopId === stopId && w.placeId === placeId && w.deletedAt === null,
  );
  if (!wt) return DEFAULT_WALK_RANGE;
  return { min: wt.minutesMin, max: wt.minutesMax };
}

/**
 * Constrói o `GotoInput` a partir de fontes de dados em memória.
 */
export function buildGotoInputFromSources(
  sources: GotoDataSources,
  now: number,
  config?: DomainConfig,
): GotoInput | null {
  const { route: r, options, walkTimes, observations, rides, schedule } = sources;
  if (r.deletedAt !== null) return null;

  const clock = lisbonWallClock(now);
  const serviceDate = clock.date;
  const { dayType } = dayTypeOf(serviceDate, schedule.calendar);
  const runningTripIds = new Set(tripsRunningOn(serviceDate, dayType, schedule.schedule).map((t) => t.id));
  const trips = schedule.trips.filter((t) => runningTripIds.has(t.id));

  const validFrom = (tripId: string): string | null => {
    const t = schedule.schedule.trips.find((x) => x.id === tripId);
    if (!t) return null;
    const tt = schedule.schedule.timetables.find((x) => x.id === t.timetableId);
    return tt?.validFrom ?? null;
  };

  const records = passageRecords(observations, schedule);

  const activeOptions = options
    .filter((o) => o.routeId === r.id && o.deletedAt === null)
    .sort((a, b) => a.sort - b.sort);

  // Opção a pé
  const walkRow = activeOptions.find((o) => o.kind === "walk");
  const walk: WalkOption | null =
    walkRow && walkRow.walkMinutes !== null
      ? { id: walkRow.id, walkMinutes: walkRow.walkMinutes }
      : null;

  // Mapa de observações para consulta rápida dos rides
  const obsById = new Map(observations.map((o) => [o.id, o]));

  // Opções de ônibus
  const busOptions: BusOption[] = [];
  for (const opt of activeOptions) {
    if (opt.kind !== "bus" || !opt.boardPatternStopId || !opt.alightPatternStopId) continue;

    const boardInfo = schedule.patternStopById.get(opt.boardPatternStopId);
    const alightInfo = schedule.patternStopById.get(opt.alightPatternStopId);
    if (!boardInfo || !alightInfo || boardInfo.patternId !== alightInfo.patternId) continue;

    const pattern = schedule.patterns.find((p) => p.id === boardInfo.patternId);
    if (!pattern) continue;

    const walkToBoard = findWalkRange(walkTimes, boardInfo.stopId, r.originPlaceId);
    const walkAfterAlight = findWalkRange(walkTimes, alightInfo.stopId, r.destinationPlaceId);

    // Deslocamentos anteriores neste trecho (D-022)
    const rideMinutesList: number[] = [];
    for (const rd of rides) {
      if (rd.status !== "closed" || rd.deletedAt !== null || !rd.alightingObservationId) continue;
      const bObs = obsById.get(rd.boardingObservationId);
      const aObs = obsById.get(rd.alightingObservationId);
      if (!bObs || !aObs || bObs.deletedAt !== null || aObs.deletedAt !== null) continue;
      if (bObs.matchStatus !== "auto" && bObs.matchStatus !== "manual") continue;
      if (aObs.matchStatus !== "auto" && aObs.matchStatus !== "manual") continue;
      if (bObs.patternStopId === opt.boardPatternStopId && aObs.patternStopId === opt.alightPatternStopId) {
        const diffMinutes = displayCenter((aObs.observedAt - bObs.observedAt) / 60_000);
        if (diffMinutes >= 0) {
          rideMinutesList.push(diffMinutes);
        }
      }
    }

    busOptions.push({
      id: opt.id,
      pattern,
      boardPosition: boardInfo.position,
      alightPosition: alightInfo.position,
      walkToBoard,
      walkAfterAlight,
      rideMinutes: rideMinutesList,
    });
  }

  return {
    busOptions,
    walk,
    trips,
    records,
    now,
    serviceDate,
    dayType,
    validFrom,
    config,
  };
}

/**
 * Carrega os dados do banco e monta o `GotoInput` para o trajeto.
 */
export async function buildGotoInput(
  routeId: string,
  now: number,
  schedule: ScheduleSnapshot,
  db: AnyDb,
  config?: DomainConfig,
): Promise<GotoInput | null> {
  const [routes, options, walkTimes, observations, rides] = await Promise.all([
    selectLive(db, route),
    selectLive(db, option),
    selectLive(db, walkTime),
    selectLive(db, observation),
    selectLive(db, ride),
  ]);

  const targetRoute = routes.find((r) => r.id === routeId);
  if (!targetRoute) return null;

  return buildGotoInputFromSources(
    {
      route: targetRoute,
      options,
      walkTimes,
      observations,
      rides,
      schedule,
    },
    now,
    config,
  );
}
