import { describe, expect, it } from "vitest";
import { replay } from "./replay.ts";
import { buildSyntheticTables } from "./testing/syntheticBackup.ts";
import type { BackupRow } from "@notebus/domain/src/backup.ts";

// Base da viagem de teste: partida 08:10, Arrabalde (pos. 2) base 08:12 (minuto 492).
// Com margem padrão 2 e incerteza ±4 (interpolado), sem registros:
// faixa 08:08 a 08:16, esteja às 08:08 - 2 = 08:06 (minuto 486).
// Se o ônibus passou às 08:14 (minuto 494) >= 08:06 -> passou.
// Se o ônibus passou às 08:04 (minuto 484) < 08:06 -> falhou (veio antes do esteja às).

const DAY_MS = 86_400_000;
const BASE_TIME = Date.UTC(2026, 9, 1, 7, 0, 0); // 01/10/2026

function makeBoarding(id: string, dayIndex: number, serviceMinute: number, deviationMin: number, extra: BackupRow = {}): BackupRow {
  const observedAt = BASE_TIME + dayIndex * DAY_MS + (serviceMinute - 420) * 60_000;
  return {
    id,
    created_at: observedAt,
    updated_at: observedAt,
    deleted_at: null,
    source: "user",
    stop_id: "stop-arrabalde",
    line_id: "line-1",
    pattern_stop_id: "ps-1",
    trip_id: "trip-0810",
    observed_at: observedAt,
    observed_end_at: null,
    service_date: `2026-10-${String(dayIndex + 1).padStart(2, "0")}`,
    service_minute: serviceMinute,
    deviation_min: deviationMin,
    match_status: "auto",
    mode: "live",
    kind: "boarded",
    recorded_at: observedAt,
    ...extra,
  };
}

describe("Replay do Critério 4 (src/replay.ts)", () => {
  it("caso 1: todos passam (10 de 10)", () => {
    // 10 embarques ao vivo às 08:14 (minuto 494, desvio +2), onde o esteja às calculado é <= 08:14
    const observations: BackupRow[] = Array.from({ length: 10 }, (_, i) =>
      makeBoarding(`obs-${i}`, i, 494, 2)
    );
    const tables = buildSyntheticTables(observations);
    const result = replay(tables);

    expect(result.resumo.total).toBe(10);
    expect(result.resumo.passed).toBe(10);
    expect(result.resumo.failed).toBe(0);
    expect(result.resumo.ratio).toBe(1);
    expect(result.resumo.verdict).toBe("passou");
    expect(result.failures).toHaveLength(0);
    expect(result.boardings[0]!.shouldBeAt).toBe("08:06");
    expect(result.boardings[0]!.passed).toBe(true);
  });

  it("caso 2: 9 de 10 passam (90%): passou", () => {
    // 9 embarques às 08:14 (passam) e 1 embarque às 08:04 (falha: veio antes do esteja às 08:06)
    const observations: BackupRow[] = [
      ...Array.from({ length: 9 }, (_, i) => makeBoarding(`obs-${i}`, i, 494, 2)),
      makeBoarding("obs-fail", 9, 484, -8), // 08:04 < 08:06
    ];
    const tables = buildSyntheticTables(observations);
    const result = replay(tables);

    expect(result.resumo.total).toBe(10);
    expect(result.resumo.passed).toBe(9);
    expect(result.resumo.failed).toBe(1);
    expect(result.resumo.ratio).toBe(0.9);
    expect(result.resumo.verdict).toBe("passou");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.observationId).toBe("obs-fail");
    expect(result.failures[0]!.lineCode).toBe("1");
    expect(result.failures[0]!.stopName).toBe("Arrabalde");
    expect(result.failures[0]!.deviationMinutes).toBe(-8);
  });

  it("caso 3: 8 de 10 passam (80%): não passou", () => {
    // 8 passam, 2 falham
    const observations: BackupRow[] = [
      ...Array.from({ length: 8 }, (_, i) => makeBoarding(`obs-${i}`, i, 494, 2)),
      makeBoarding("obs-fail-1", 8, 484, -8),
      makeBoarding("obs-fail-2", 9, 483, -9),
    ];
    const tables = buildSyntheticTables(observations);
    const result = replay(tables);

    expect(result.resumo.total).toBe(10);
    expect(result.resumo.passed).toBe(8);
    expect(result.resumo.failed).toBe(2);
    expect(result.resumo.ratio).toBe(0.8);
    expect(result.resumo.verdict).toBe("não passou");
  });

  it("caso 4: amostra pequena (< 10 embarques)", () => {
    const observations: BackupRow[] = Array.from({ length: 5 }, (_, i) =>
      makeBoarding(`obs-${i}`, i, 494, 2)
    );
    const tables = buildSyntheticTables(observations);
    const result = replay(tables);

    expect(result.resumo.total).toBe(5);
    expect(result.resumo.verdict).toBe("amostra pequena: 5 embarques");
  });

  it("caso 5: exclusões (memória, ajustado, não embarque, sem viagem casada, sem linha/ponto)", () => {
    const observations: BackupRow[] = [
      makeBoarding("obs-valid", 0, 494, 2),
      makeBoarding("obs-mem", 1, 494, 2, { mode: "memory" }),
      makeBoarding("obs-lat", 2, 494, 2, { mode: "later" }),
      makeBoarding("obs-pass", 3, 494, 2, { kind: "passed" }),
      makeBoarding("obs-alight", 4, 494, 2, { kind: "alighted" }),
      makeBoarding("obs-unmatched", 5, 494, 2, { match_status: "orphan", trip_id: null }),
      makeBoarding("obs-no-line", 6, 494, 2, { line_id: "linha-inexistente" }),
    ];
    const tables = buildSyntheticTables(observations);
    const result = replay(tables);

    expect(result.boardings).toHaveLength(1);
    expect(result.resumo.total).toBe(1);
    expect(result.exclusions.total).toBe(6);
    expect(result.exclusions.memory).toBe(1);
    expect(result.exclusions.later).toBe(1);
    expect(result.exclusions.notBoarded).toBe(2); // passed + alighted
    expect(result.exclusions.unmatched).toBe(1);
    expect(result.exclusions.missingSchedule).toBe(1);
  });

  it("não vaza futuro: registro posterior acrescentado não muda o cálculo do anterior (T-88)", () => {
    // 5 embarques no passado
    const obsInitial = Array.from({ length: 5 }, (_, i) => makeBoarding(`obs-${i}`, i, 494, 2));
    const tablesInitial = buildSyntheticTables(obsInitial);
    const resultBefore = replay(tablesInitial);

    // Acrescenta um registro futuro com desvio extremo (+15 min)
    const futureObs = makeBoarding("obs-future", 20, 507, 15);
    const tablesWithFuture = buildSyntheticTables([...obsInitial, futureObs]);
    const resultAfter = replay(tablesWithFuture);

    // Os primeiros 5 registros devem ter exatamente os mesmos resultados e 'shouldBeAt'
    for (let i = 0; i < 5; i++) {
      expect(resultAfter.boardings[i]!.shouldBeAt).toBe(resultBefore.boardings[i]!.shouldBeAt);
      expect(resultAfter.boardings[i]!.passed).toBe(resultBefore.boardings[i]!.passed);
    }
  });

  it("comparação de igualdade: embarque exatamente no minuto do esteja às passa (>=)", () => {
    // Embarque exatamente às 08:06 (minuto 486) quando o esteja às é 08:06
    const obs = [makeBoarding("obs-exact", 0, 486, -6)];
    const tables = buildSyntheticTables(obs);
    const result = replay(tables);

    expect(result.boardings[0]!.shouldBeAt).toBe("08:06");
    expect(result.boardings[0]!.passed).toBe(true);
  });
});
