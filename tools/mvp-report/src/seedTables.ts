/** Converte SeedFile (formato mobilis-seed) em BackupTables com IDs determinísticos. */
import {
  BACKUP_TABLES,
  officialId,
  type BackupRow,
  type BackupTables,
  type DayTypeCode,
  type SeedFile,
} from "@notebus/domain";

const DAY_TYPE_INFO: Record<DayTypeCode, { name: string; sort: number }> = {
  weekday: { name: "Dia útil", sort: 1 },
  saturday: { name: "Sábado", sort: 2 },
  sunday_holiday: { name: "Domingo e feriado", sort: 3 },
};

/**
 * Transforma um SeedFile validado no formato BackupTables que o replay.ts consome.
 * Usa exatamente as mesmas regras de id determinístico (officialId/UUIDv5) que o app grava.
 */
export function seedToBackupTables(seed: SeedFile): BackupTables {
  const networkId = officialId("mobilis/network");

  const lines: BackupRow[] = seed.lines.map((l) => ({
    id: l.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: l.key,
    network_id: networkId,
    code: l.code,
    name: l.name,
    color: l.color,
  }));

  const stops: BackupRow[] = seed.stops.map((s) => ({
    id: s.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: s.key,
    network_id: networkId,
    name: s.name,
    aliases: JSON.stringify(s.aliases),
    external_id: s.externalId,
    lat: null,
    lon: null,
    location_source: null,
    note: null,
  }));

  const patterns: BackupRow[] = seed.patterns.map((p) => ({
    id: p.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: p.key,
    line_id: p.lineId,
    label: p.label,
    is_circular: p.isCircular ? 1 : 0,
  }));

  const patternStops: BackupRow[] = seed.patternStops.map((ps) => ({
    id: ps.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: ps.key,
    pattern_id: ps.patternId,
    position: ps.position,
    stop_id: ps.stopId,
    is_timepoint: ps.isTimepoint ? 1 : 0,
    timepoint_label: ps.timepointLabel,
  }));

  const timetables: BackupRow[] = seed.timetables.map((t) => ({
    id: t.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: t.key,
    pattern_id: t.patternId,
    dataset_id: null,
    valid_from: t.validFrom,
    valid_to: t.validTo,
  }));

  const seasonKey = (s: { startMd: string; endMd: string; mode: string }) =>
    `mobilis/season/${s.startMd}-${s.endMd}-${s.mode}`;

  const trips: BackupRow[] = seed.trips.map((t) => ({
    id: t.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: t.key,
    timetable_id: t.timetableId,
    first_position: t.firstPosition,
    last_position: t.lastPosition,
    season_id: t.season ? officialId(seasonKey(t.season)) : null,
    frequency_id: null,
  }));

  const stopTimes: BackupRow[] = seed.stopTimes.map((st) => ({
    id: st.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: st.key,
    trip_id: st.tripId,
    pattern_stop_id: st.patternStopId,
    service_minute: st.serviceMinute,
    origin: "official",
  }));

  const days = [...new Set(seed.trips.flatMap((t) => t.dayTypes))];
  const dayTypeIds = new Map(days.map((code) => [code, officialId(`mobilis/day_type/${code}`)]));

  const dayTypes: BackupRow[] = days.map((code) => {
    const key = `mobilis/day_type/${code}`;
    const info = DAY_TYPE_INFO[code] ?? { name: code, sort: 1 };
    return {
      id: dayTypeIds.get(code)!,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
      source: "official",
      official_key: key,
      network_id: networkId,
      code,
      name: info.name,
      sort: info.sort,
    };
  });

  const tripDayTypes: BackupRow[] = seed.trips.flatMap((t) =>
    t.dayTypes.map((code) => {
      const key = `${t.key}/day/${code}`;
      return {
        id: officialId(key),
        created_at: 0,
        updated_at: 0,
        deleted_at: null,
        source: "official",
        official_key: key,
        trip_id: t.id,
        day_type_id: dayTypeIds.get(code)!,
      };
    })
  );

  const holidays: BackupRow[] = (seed.holidays ?? []).map((h) => ({
    id: h.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    source: "official",
    official_key: h.key,
    network_id: networkId,
    date: h.date,
    name: h.name,
    scope: h.scope,
    recurring: 0,
  }));

  const tables = {} as BackupTables;
  for (const t of BACKUP_TABLES) {
    tables[t] = [];
  }

  tables.line = lines;
  tables.stop = stops;
  tables.pattern = patterns;
  tables.pattern_stop = patternStops;
  tables.timetable = timetables;
  tables.trip = trips;
  tables.stop_time = stopTimes;
  tables.day_type = dayTypes;
  tables.trip_day_type = tripDayTypes;
  tables.holiday = holidays;
  tables.official_edits = {};

  return tables;
}
