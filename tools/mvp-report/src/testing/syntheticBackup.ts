/** Gerador de backups sintéticos para testes do mvp-report (D-091). */
import {
  BACKUP_TABLES,
  serializeBackup,
  type BackupInput,
  type BackupRow,
  type BackupTables,
} from "@notebus/domain/src/backup.ts";
import { sha256Node } from "../validate.ts";

export interface SyntheticNetworkData {
  lineId?: string;
  lineCode?: string;
  stopId?: string;
  stopName?: string;
  patternId?: string;
  patternStopId?: string;
  tripId?: string;
  timetableId?: string;
}

export function buildSyntheticInput(
  observations: BackupRow[] = [],
  netData: SyntheticNetworkData = {},
  options: {
    marginMinutes?: number;
    exportedAt?: number;
    timezone?: string;
  } = {}
): BackupInput {
  const lineId = netData.lineId ?? "line-1";
  const lineCode = netData.lineCode ?? "1";
  const stopId = netData.stopId ?? "stop-arrabalde";
  const stopName = netData.stopName ?? "Arrabalde";
  const patternId = netData.patternId ?? "pat-l1";
  const patternStopId = netData.patternStopId ?? "ps-1";
  const tripId = netData.tripId ?? "trip-0810";
  const timetableId = netData.timetableId ?? "tt-1";

  const tables: BackupInput["tables"] = {
    line: [{ id: lineId, code: lineCode, name: "Linha 1", color: "#7CB342", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null, network_id: "net-1" }],
    stop: [
      { id: "stop-start", name: "Estação", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null, network_id: "net-1", aliases: null, external_id: "S0", lat: 39.75, lon: -8.81, location_source: null, note: null },
      { id: stopId, name: stopName, source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null, network_id: "net-1", aliases: null, external_id: "A1", lat: 39.74, lon: -8.80, location_source: null, note: null },
      { id: "stop-mid", name: "Guimarota", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null, network_id: "net-1", aliases: null, external_id: "S6", lat: 39.73, lon: -8.79, location_source: null, note: null },
    ],
    pattern: [{ id: patternId, line_id: lineId, label: "Ida", is_circular: 0, source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null }],
    pattern_stop: [
      { id: "ps-0", pattern_id: patternId, stop_id: "stop-start", position: 1, is_timepoint: 1, timepoint_label: "Estação", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null },
      { id: patternStopId, pattern_id: patternId, stop_id: stopId, position: 2, is_timepoint: 0, timepoint_label: null, source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null },
      { id: "ps-6", pattern_id: patternId, stop_id: "stop-mid", position: 6, is_timepoint: 1, timepoint_label: "Guimarota", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null },
    ],
    timetable: [{ id: timetableId, pattern_id: patternId, dataset_id: "ds-1", valid_from: "2026-09-01", valid_to: null, source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null }],
    trip: [{ id: tripId, timetable_id: timetableId, first_position: 1, last_position: 10, season_id: null, frequency_id: null, source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null }],
    stop_time: [
      { id: "st-0", trip_id: tripId, pattern_stop_id: "ps-0", service_minute: 490, origin: "official", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null },
      { id: "st-6", trip_id: tripId, pattern_stop_id: "ps-6", service_minute: 500, origin: "official", source: "user", official_key: null, created_at: 1, updated_at: 1, deleted_at: null },
    ],
    setting: [
      { id: "s-margin", key: "margin_minutes", value: String(options.marginMinutes ?? 2), source: "user", created_at: 1, updated_at: 1, deleted_at: null },
    ],
    observation: observations,
  };

  return {
    schemaVersion: 5,
    appVersion: "0.9.0",
    exportedAt: options.exportedAt ?? Date.UTC(2026, 9, 25, 12, 0, 0),
    network: { name: "MOBILIS Leiria", timezone: options.timezone ?? "Europe/Lisbon" },
    datasets: [{ name: "mobilis", version: "2026-09-01" }],
    tables,
    officialEdits: {},
  };
}

export function buildSyntheticTables(
  observations: BackupRow[] = [],
  netData: SyntheticNetworkData = {},
  options?: { marginMinutes?: number; exportedAt?: number; timezone?: string }
): BackupTables {
  const input = buildSyntheticInput(observations, netData, options);
  const tables = {} as BackupTables;
  for (const t of BACKUP_TABLES) {
    tables[t] = [...(input.tables[t] ?? [])];
  }
  tables.official_edits = {};
  return tables;
}

export async function createSyntheticBackupText(
  observations: BackupRow[] = [],
  netData: SyntheticNetworkData = {},
  options?: { marginMinutes?: number; exportedAt?: number; timezone?: string }
): Promise<string> {
  const input = buildSyntheticInput(observations, netData, options);
  return serializeBackup(input, sha256Node);
}
