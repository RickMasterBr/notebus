import { describe, expect, it } from "vitest";
import { officialId } from "@notebus/domain";
import { seedToBackupTables } from "./seedTables.ts";
import { createMinimalSeed } from "./testing/syntheticSeed.ts";

describe("seedTables: conversão do SeedFile em BackupTables (Item 1)", () => {
  it("converte todas as tabelas oficiais com IDs determinísticos (officialId)", () => {
    const seed = createMinimalSeed();
    const tables = seedToBackupTables(seed);

    // Linhas
    expect(tables.line).toHaveLength(1);
    expect(tables.line[0]!.id).toBe(seed.lines[0]!.id);
    expect(tables.line[0]!.id).toBe(officialId("mobilis/line/1"));
    expect(tables.line[0]!.code).toBe("1");
    expect(tables.line[0]!.source).toBe("official");
    expect(tables.line[0]!.official_key).toBe("mobilis/line/1");

    // Paragens
    expect(tables.stop).toHaveLength(2);
    expect(tables.stop[0]!.id).toBe(seed.stops[0]!.id);
    expect(tables.stop[0]!.id).toBe(officialId("mobilis/stop/S1"));
    expect(tables.stop[0]!.name).toBe("Estação");
    expect(tables.stop[1]!.name).toBe("Arrabalde");

    // Percursos
    expect(tables.pattern).toHaveLength(1);
    expect(tables.pattern[0]!.id).toBe(seed.patterns[0]!.id);
    expect(tables.pattern[0]!.line_id).toBe(seed.lines[0]!.id);

    // Paragens de percurso
    expect(tables.pattern_stop).toHaveLength(2);
    expect(tables.pattern_stop[0]!.id).toBe(seed.patternStops[0]!.id);
    expect(tables.pattern_stop[0]!.position).toBe(1);
    expect(tables.pattern_stop[1]!.id).toBe(seed.patternStops[1]!.id);
    expect(tables.pattern_stop[1]!.position).toBe(2);

    // Quadros de horários
    expect(tables.timetable).toHaveLength(1);
    expect(tables.timetable[0]!.id).toBe(seed.timetables[0]!.id);
    expect(tables.timetable[0]!.valid_from).toBe("2026-09-01");

    // Viagens
    expect(tables.trip).toHaveLength(1);
    expect(tables.trip[0]!.id).toBe(seed.trips[0]!.id);
    expect(tables.trip[0]!.first_position).toBe(1);
    expect(tables.trip[0]!.last_position).toBe(2);

    // Horários (stop_time)
    expect(tables.stop_time).toHaveLength(2);
    expect(tables.stop_time[0]!.id).toBe(seed.stopTimes[0]!.id);
    expect(tables.stop_time[0]!.service_minute).toBe(490);
    expect(tables.stop_time[1]!.id).toBe(seed.stopTimes[1]!.id);
    expect(tables.stop_time[1]!.service_minute).toBe(500);

    // Tipos de dia
    expect(tables.day_type).toHaveLength(1);
    expect(tables.day_type[0]!.id).toBe(officialId("mobilis/day_type/weekday"));
    expect(tables.day_type[0]!.code).toBe("weekday");

    // Trip day types
    expect(tables.trip_day_type).toHaveLength(1);
    expect(tables.trip_day_type[0]!.trip_id).toBe(seed.trips[0]!.id);
    expect(tables.trip_day_type[0]!.day_type_id).toBe(officialId("mobilis/day_type/weekday"));

    // Feriados
    expect(tables.holiday).toHaveLength(1);
    expect(tables.holiday[0]!.id).toBe(officialId("mobilis/holiday/2026-05-22"));
    expect(tables.holiday[0]!.date).toBe("2026-05-22");
    expect(tables.holiday[0]!.name).toBe("Feriado Municipal de Leiria");

    // Tabelas que não vêm do seed ficam vazias
    expect(tables.observation).toEqual([]);
    expect(tables.ride).toEqual([]);
    expect(tables.official_edits).toEqual({});
  });
});
