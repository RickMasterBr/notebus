/** Gerador de seed sintético válido para testes do mvp-report (D-091). */
import { officialId, parseSeedFile, type SeedFile } from "@notebus/domain";

export interface SyntheticSeedOptions {
  stopTimeMinute?: number;
}

export function createMinimalSeed(options: SyntheticSeedOptions = {}): SeedFile {
  const lineKey = "mobilis/line/1";
  const stopStartKey = "mobilis/stop/S1";
  const stopMidKey = "mobilis/stop/S2";
  const patternKey = "mobilis/2026-09-01/pattern/L1";
  const ps0Key = `${patternKey}/pos/1`;
  const ps1Key = `${patternKey}/pos/2`;
  const ttKey = "mobilis/2026-09-01/timetable/L1";
  const tripKey = "mobilis/2026-09-01/trip/L1/util/0810";
  const st0Key = `${tripKey}/pos/1`;
  const st1Key = `${tripKey}/pos/2`;
  const holidayKey = "mobilis/holiday/2026-05-22";

  const raw = {
    format: "notebus.mobilis-seed",
    formatVersion: 1,
    network: { name: "MOBILIS Leiria", timezone: "Europe/Lisbon" },
    dataset: { name: "mobilis", version: "2026-09-01" },
    lines: [
      { id: officialId(lineKey), key: lineKey, code: "1", name: "Linha 1", color: "#7CB342" },
    ],
    stops: [
      { id: officialId(stopStartKey), key: stopStartKey, name: "Estação", aliases: [], externalId: "S1" },
      { id: officialId(stopMidKey), key: stopMidKey, name: "Arrabalde", aliases: ["Centro"], externalId: "S2" },
    ],
    patterns: [
      { id: officialId(patternKey), key: patternKey, code: "L1", lineId: officialId(lineKey), label: "Ida", isCircular: false },
    ],
    patternStops: [
      { id: officialId(ps0Key), key: ps0Key, patternId: officialId(patternKey), position: 1, stopId: officialId(stopStartKey), isTimepoint: true, timepointLabel: "Estação" },
      { id: officialId(ps1Key), key: ps1Key, patternId: officialId(patternKey), position: 2, stopId: officialId(stopMidKey), isTimepoint: true, timepointLabel: "Arrabalde" },
    ],
    timetables: [
      { id: officialId(ttKey), key: ttKey, patternId: officialId(patternKey), validFrom: "2026-09-01", validTo: null },
    ],
    trips: [
      { id: officialId(tripKey), key: tripKey, timetableId: officialId(ttKey), firstPosition: 1, lastPosition: 2, dayTypes: ["weekday"], season: null, sourceTable: 1 },
    ],
    stopTimes: [
      { id: officialId(st0Key), key: st0Key, tripId: officialId(tripKey), patternStopId: officialId(ps0Key), serviceMinute: 490 },
      { id: officialId(st1Key), key: st1Key, tripId: officialId(tripKey), patternStopId: officialId(ps1Key), serviceMinute: options.stopTimeMinute ?? 500 },
    ],
    holidays: [
      { id: officialId(holidayKey), key: holidayKey, date: "2026-05-22", name: "Feriado Municipal de Leiria", scope: "municipal" },
    ],
  };

  return parseSeedFile(raw);
}
