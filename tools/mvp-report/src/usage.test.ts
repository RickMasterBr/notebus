import { describe, expect, it } from "vitest";
import { calculateUsage } from "./usage.ts";
import { buildSyntheticTables } from "./testing/syntheticBackup.ts";
import type { BackupRow } from "@notebus/domain/src/backup.ts";

describe("Critério 2: Dias com registro ao vivo (src/usage.ts)", () => {
  it("contagem básica: dias com pelo menos 1 registro, total, firstDay, lastDay e perDay", () => {
    // 3 registros em 2 dias: 2 no dia 01/10 e 1 no dia 03/10
    const observations: BackupRow[] = [
      { id: "o1", observed_at: Date.UTC(2026, 9, 1, 8, 0, 0), mode: "live", deleted_at: null },
      { id: "o2", observed_at: Date.UTC(2026, 9, 1, 14, 0, 0), mode: "live", deleted_at: null },
      { id: "o3", observed_at: Date.UTC(2026, 9, 3, 9, 0, 0), mode: "live", deleted_at: null },
    ];

    const tables = buildSyntheticTables(observations);
    const usage = calculateUsage(tables);

    expect(usage.daysWithRecord).toBe(2);
    expect(usage.totalRecords).toBe(3);
    expect(usage.firstDay).toBe("2026-10-01");
    expect(usage.lastDay).toBe("2026-10-03");
    expect(usage.perDay).toEqual({
      "2026-10-01": 2,
      "2026-10-03": 1,
    });
  });

  it("ignora registros de memória, ajustados e apagados (somente live conta)", () => {
    const observations: BackupRow[] = [
      { id: "o-live", observed_at: Date.UTC(2026, 9, 1, 8, 0, 0), mode: "live", deleted_at: null },
      { id: "o-mem", observed_at: Date.UTC(2026, 9, 2, 8, 0, 0), mode: "memory", deleted_at: null },
      { id: "o-later", observed_at: Date.UTC(2026, 9, 3, 8, 0, 0), mode: "later", deleted_at: null },
      { id: "o-del", observed_at: Date.UTC(2026, 9, 4, 8, 0, 0), mode: "live", deleted_at: Date.UTC(2026, 9, 4, 9, 0, 0) },
    ];

    const tables = buildSyntheticTables(observations);
    const usage = calculateUsage(tables);

    expect(usage.daysWithRecord).toBe(1);
    expect(usage.totalRecords).toBe(1);
    expect(usage.firstDay).toBe("2026-10-01");
    expect(usage.lastDay).toBe("2026-10-01");
    expect(usage.perDay).toEqual({ "2026-10-01": 1 });
  });

  it("atravessando a meia-noite de Lisboa: conta pelo dia local de Lisboa e não UTC", () => {
    // Em 15/10/2026 (horário de verão de Lisboa: WEST = UTC+1):
    // 23:30 UTC de 15/10/2026 corresponde a 00:30 de 16/10/2026 em Lisboa!
    // No UTC, ambos os registros estariam em 2026-10-15 (1 dia).
    // Em Lisboa, estão em 2026-10-15 e 2026-10-16 (2 dias distintos).
    const obsAtNoonUtc = Date.UTC(2026, 9, 15, 12, 0, 0); // 13:00 Lisboa em 15/10
    const obsNearMidnightUtc = Date.UTC(2026, 9, 15, 23, 30, 0); // 00:30 Lisboa em 16/10

    const observations: BackupRow[] = [
      { id: "o-day1", observed_at: obsAtNoonUtc, mode: "live", deleted_at: null },
      { id: "o-day2", observed_at: obsNearMidnightUtc, mode: "live", deleted_at: null },
    ];

    const tables = buildSyntheticTables(observations);
    const usage = calculateUsage(tables);

    expect(usage.daysWithRecord).toBe(2);
    expect(usage.firstDay).toBe("2026-10-15");
    expect(usage.lastDay).toBe("2026-10-16");
    expect(usage.perDay["2026-10-15"]).toBe(1);
    expect(usage.perDay["2026-10-16"]).toBe(1);
  });

  it("mudança de horário de verão em outubro: registros perto de 01:00 do dia da mudança", () => {
    // 25/10/2026: transição de WEST (UTC+1) para WET (UTC+0) às 01:00 UTC.
    // Às 00:30 UTC: Lisboa está a UTC+1 (01:30 de 25/10) -> data 2026-10-25
    // Às 01:30 UTC: Lisboa está a UTC+0 (01:30 de 25/10) -> data 2026-10-25
    const obsBefore = Date.UTC(2026, 9, 25, 0, 30, 0);
    const obsAfter = Date.UTC(2026, 9, 25, 1, 30, 0);

    const observations: BackupRow[] = [
      { id: "o-change-1", observed_at: obsBefore, mode: "live", deleted_at: null },
      { id: "o-change-2", observed_at: obsAfter, mode: "live", deleted_at: null },
    ];

    const tables = buildSyntheticTables(observations);
    const usage = calculateUsage(tables);

    expect(usage.daysWithRecord).toBe(1);
    expect(usage.totalRecords).toBe(2);
    expect(usage.firstDay).toBe("2026-10-25");
    expect(usage.lastDay).toBe("2026-10-25");
    expect(usage.perDay["2026-10-25"]).toBe(2);
  });

  it("filtro por período: restringe a contagem às datas from e to", () => {
    const observations: BackupRow[] = [
      { id: "o1", observed_at: Date.UTC(2026, 9, 1, 10, 0, 0), mode: "live", deleted_at: null },
      { id: "o2", observed_at: Date.UTC(2026, 9, 5, 10, 0, 0), mode: "live", deleted_at: null },
      { id: "o3", observed_at: Date.UTC(2026, 9, 10, 10, 0, 0), mode: "live", deleted_at: null },
    ];

    const tables = buildSyntheticTables(observations);
    const usage = calculateUsage(tables, { from: "2026-10-03", to: "2026-10-08" });

    expect(usage.daysWithRecord).toBe(1);
    expect(usage.totalRecords).toBe(1);
    expect(usage.firstDay).toBe("2026-10-05");
    expect(usage.lastDay).toBe("2026-10-05");
  });
});
