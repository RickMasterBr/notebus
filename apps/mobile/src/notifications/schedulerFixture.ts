/** SÓ PARA TESTE: a rede inventada de `data/registroFixture.ts` com um trajeto Casa → Facul e opções de ônibus da L1. */
import { eq } from "drizzle-orm";
import { fixture, lineId, lisbon, stopId, tripIdOf, type Fixture } from "../data/registroFixture";
import { createAlarms, type NewAlarm } from "../db/alarms";
import { createPlaces } from "../db/places";
import { patternStop } from "../db/schema";

export { lisbon, stopId, tripIdOf, lineId };
export const T0 = lisbon("2026-10-01", "09:00");
/** Quarta-feira 07/10/2026, 07:00 em Lisboa. A L1 passa na Arrabalde (pos. 2) às 08:12 e na Campus (pos. 5) às 08:44. */
export const WED_0700 = lisbon("2026-10-07", "07:00");

export interface SchedulerFixture extends Fixture {
  placesRepo: ReturnType<typeof createPlaces>;
  alarmsRepo: ReturnType<typeof createAlarms>;
  casaId: string;
  faculId: string;
  routeId: string;
  /** As opções de ônibus da L1 criadas (embarque na Arrabalde, descida na posição pedida). */
  optionIds: string[];
  newAlarm: (over?: Partial<NewAlarm>) => NewAlarm;
}

export async function schedulerFixture(alightPositions: number[] = [5]): Promise<SchedulerFixture> {
  const base = await fixture();
  const placesRepo = createPlaces(base.db);
  const alarmsRepo = createAlarms(base.db);
  const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
  const facul = await placesRepo.createPlace({ name: "Facul" }, T0);
  const route = await placesRepo.ensureRoute(casa.id, facul.id, T0);
  const pattern = [...base.data.patternLineId].find(([, line]) => line === lineId("1"))![0];
  const stops = await base.db.select().from(patternStop).where(eq(patternStop.patternId, pattern));
  const at = (position: number) => stops.find((s) => s.position === position)!;
  await placesRepo.setWalkTime(at(2).stopId, casa.id, { minutesMin: 6, minutesMax: null }, T0);
  const optionIds: string[] = [];
  for (const position of alightPositions) {
    await placesRepo.setWalkTime(at(position).stopId, facul.id, { minutesMin: 4, minutesMax: null }, T0);
    const opt = await placesRepo.addOption({ kind: "bus", routeId: route.id, boardPatternStopId: at(2).id, alightPatternStopId: at(position).id }, T0);
    optionIds.push(opt.id);
  }
  const newAlarm = (over: Partial<NewAlarm> = {}): NewAlarm => ({
    optionId: optionIds[0]!,
    anchorTripId: tripIdOf("1", "0810"),
    anchorBaseMinute: 492,
    weekdays: [1, 2, 3, 4, 5],
    onceDate: null,
    validFrom: "2026-10-01",
    validTo: null,
    enabled: true,
    ...over,
  });
  return { ...base, placesRepo, alarmsRepo, casaId: casa.id, faculId: facul.id, routeId: route.id, optionIds, newAlarm };
}

