import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, officialId, type BackupRow, type BackupTables } from "@notebus/domain";
import { MIN_EVALUATED_BOARDINGS, replay } from "./replay.ts";
import { formatReportText } from "./report.ts";
import { seedToBackupTables } from "./seedTables.ts";
import { buildSyntheticTables } from "./testing/syntheticBackup.ts";
import { createMinimalSeed } from "./testing/syntheticSeed.ts";
import type { MvpReportResult } from "./types.ts";
import { calculateUsage } from "./usage.ts";

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

  it("constante MIN_EVALUATED_BOARDINGS é 10 e relatório mostra quantos faltam sem sugerir nota", () => {
    expect(MIN_EVALUATED_BOARDINGS).toBe(10);

    const obs = Array.from({ length: 5 }, (_, i) => makeBoarding(`obs-${i}`, i, 494, 2));
    const tables = buildSyntheticTables(obs);
    const rep = replay(tables);
    const uso = calculateUsage(tables);

    const reportResult: MvpReportResult = {
      file: "test.json",
      exportedAt: "2026-10-16T12:00:00Z",
      criterio2: uso,
      criterio4: rep,
    };
    const text = formatReportText(reportResult);

    expect(text).toContain("Resultado: amostra pequena: 5 embarques (faltam 5)");
    expect(text).not.toContain("Resultado: 5 de 5");
    expect(text).not.toContain("passou");
    expect(text).not.toContain("não passou");
  });

  describe("investigação das causas de missingSchedule (Item 1)", () => {
    it("tipo dos ids: IDs em formato string funcionam no Map de linhas", () => {
      // Cria observação com line_id string 'line-1'
      const obs = [makeBoarding("obs-str", 0, 494, 2, { line_id: "line-1" })];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(0);
      expect(res.boardings).toHaveLength(1);
      expect(res.boardings[0]!.lineCode).toBe("1");
    });

    it("linhas com deleted_at !== null nas tabelas do backup não caem em missingSchedule", () => {
      const obs = [makeBoarding("obs-del-line", 0, 494, 2)];
      const tables = buildSyntheticTables(obs);
      // Marca a linha como apagada
      tables.line[0]!.deleted_at = Date.UTC(2026, 9, 2, 10, 0, 0);

      const res = replay(tables);
      expect(res.exclusions.missingSchedule).toBe(0);
      expect(res.boardings).toHaveLength(1);
    });

    it("linhas em official_edits são encontradas por mergeRows e não caem em missingSchedule", () => {
      const obs = [makeBoarding("obs-edit", 0, 494, 2, { line_id: "line-official-edit" })];
      const tables = buildSyntheticTables(obs);
      // Move a linha para official_edits
      tables.official_edits.line = [
        {
          id: "line-official-edit",
          code: "1-EDIT",
          name: "Linha Editada",
          source: "official_edited",
          deleted_at: null,
        },
      ];

      const res = replay(tables);
      expect(res.exclusions.missingSchedule).toBe(0);
      expect(res.boardings[0]!.lineCode).toBe("1-EDIT");
    });

    it("registros de memória, ajustados ou não-embarque não caem em missingSchedule", () => {
      const obs = [
        makeBoarding("obs-mem", 0, 494, 2, { mode: "memory", line_id: "nao-existe" }),
        makeBoarding("obs-lat", 1, 494, 2, { mode: "later", line_id: "nao-existe" }),
        makeBoarding("obs-pass", 2, 494, 2, { kind: "passed", line_id: "nao-existe" }),
      ];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(0);
      expect(res.exclusions.memory).toBe(1);
      expect(res.exclusions.later).toBe(1);
      expect(res.exclusions.notBoarded).toBe(1);
    });

    it("sem viagem casada (unmatched) cai em unmatched e não em missingSchedule", () => {
      const obs = [
        makeBoarding("obs-unm", 0, 494, 2, { match_status: "orphan", trip_id: null, line_id: "nao-existe" }),
      ];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(0);
      expect(res.exclusions.unmatched).toBe(1);
    });

    it("causa identificada: line_id ausente nas tabelas do backup cai em missingSchedule com qual=line_id", () => {
      const obs = [makeBoarding("obs-absent-line", 0, 494, 2, { line_id: "line-dataset-ausente" })];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(1);
      const detail = res.exclusions.details?.missingSchedule[0];
      expect(detail).toBeDefined();
      expect(detail?.observationId).toBe("obs-absent-line");
      expect(detail?.qual).toBe("line_id");
      expect(detail?.detail).toContain("qual: line_id");
      expect(detail?.detail).toContain('"line-dataset-ausente" (ausente no dataset)');
    });

    it("causa identificada: stop_id ausente nas tabelas do backup cai em missingSchedule com qual=stop_id", () => {
      const obs = [makeBoarding("obs-absent-stop", 0, 494, 2, { stop_id: "stop-dataset-ausente" })];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(1);
      const detail = res.exclusions.details?.missingSchedule[0];
      expect(detail?.qual).toBe("stop_id");
      expect(detail?.detail).toContain("qual: stop_id");
      expect(detail?.detail).toContain('"stop-dataset-ausente" (ausente no dataset)');
    });

    it("causa identificada: pattern_stop_id ausente cai em missingSchedule com qual=pattern_stop_id", () => {
      const obs = [makeBoarding("obs-absent-ps", 0, 494, 2, { pattern_stop_id: "ps-dataset-ausente" })];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(1);
      const detail = res.exclusions.details?.missingSchedule[0];
      expect(detail?.qual).toBe("pattern_stop_id");
      expect(detail?.detail).toContain("qual: pattern_stop_id");
      expect(detail?.detail).toContain('"ps-dataset-ausente" (ausente no dataset)');
    });

    it("causa identificada: id vazio no registro é apontado como vazio", () => {
      const obs = [makeBoarding("obs-empty-line", 0, 494, 2, { line_id: null })];
      const tables = buildSyntheticTables(obs);
      const res = replay(tables);

      expect(res.exclusions.missingSchedule).toBe(1);
      const detail = res.exclusions.details?.missingSchedule[0];
      expect(detail?.qual).toBe("line_id");
      expect(detail?.detail).toContain("line_id=vazio");
    });
  });

  describe("opção --detalhe e formatação das exclusões", () => {
    it("com detail: true imprime até 10 linhas por motivo de exclusão com ID, data e qual falhou", () => {
      const obs: BackupRow[] = [
        makeBoarding("obs-1", 0, 494, 2, { line_id: "line-ausente-1" }),
        makeBoarding("obs-2", 1, 494, 2, { stop_id: "stop-ausente-2" }),
        makeBoarding("obs-3", 2, 494, 2, { mode: "memory" }),
        makeBoarding("obs-4", 3, 494, 2, { mode: "later" }),
        makeBoarding("obs-5", 4, 494, 2, { kind: "passed" }),
        makeBoarding("obs-6", 5, 494, 2, { match_status: "orphan", trip_id: null }),
      ];
      const tables = buildSyntheticTables(obs);
      const rep = replay(tables, { detail: true });
      const uso = calculateUsage(tables);

      const reportResult: MvpReportResult = {
        file: "test.json",
        exportedAt: "2026-10-16T12:00:00Z",
        criterio2: uso,
        criterio4: rep,
        detail: true,
      };

      const text = formatReportText(reportResult);

      expect(text).toContain("Detalhe das exclusões:");
      expect(text).toContain("- Sem linha ou ponto no dataset (2):");
      expect(text).toContain("* ID obs-1 | 2026-10-01 | qual: line_id | valor: line_id=\"line-ausente-1\" (ausente no dataset)");
      expect(text).toContain("* ID obs-2 | 2026-10-02 | qual: stop_id | valor: stop_id=\"stop-ausente-2\" (ausente no dataset)");
      expect(text).toContain("- De memória (1):");
      expect(text).toContain("* ID obs-3 | 2026-10-03 | modo: memory");
      expect(text).toContain("- Ajustados (1):");
      expect(text).toContain("* ID obs-4 | 2026-10-04 | modo: later");
      expect(text).toContain("- Não embarque (1):");
      expect(text).toContain("* ID obs-5 | 2026-10-05 | tipo: passed");
      expect(text).toContain("- Sem viagem casada (1):");
      expect(text).toContain("* ID obs-6 | 2026-10-06 | sem viagem casada (trip_id ausente)");
    });

    it("com detail: false a saída continua sem o bloco de detalhe", () => {
      const obs = [makeBoarding("obs-1", 0, 494, 2, { line_id: "line-ausente-1" })];
      const tables = buildSyntheticTables(obs);
      const rep = replay(tables, { detail: false });
      const uso = calculateUsage(tables);

      const reportResult: MvpReportResult = {
        file: "test.json",
        exportedAt: "2026-10-16T12:00:00Z",
        criterio2: uso,
        criterio4: rep,
        detail: false,
      };

      const text = formatReportText(reportResult);
      expect(text).not.toContain("Detalhe das exclusões:");
    });
  });

  describe("relógio de teste: registros posteriores à exportação (Item 1)", () => {
    it("registros com data posterior à exportação não entram no critério 2 nem no 4 e são contabilizados", () => {
      const exportAt = Date.UTC(2026, 9, 16, 12, 0, 0); // 16/10/2026 12:00 UTC
      // 3 registros antes da exportação (dias 10, 11 e 12/10)
      const validObs: BackupRow[] = [
        makeBoarding("obs-past-1", 9, 494, 2), // 10/10
        makeBoarding("obs-past-2", 10, 494, 2), // 11/10
        makeBoarding("obs-past-3", 11, 494, 2), // 12/10
      ];
      // 2 registros do relógio de teste (dia 25/10, bem depois da exportação)
      const futureObs: BackupRow[] = [
        makeBoarding("obs-fut-1", 24, 494, 2), // 25/10
        makeBoarding("obs-fut-2", 24, 500, 8), // 25/10
      ];

      const tables = buildSyntheticTables([...validObs, ...futureObs]);
      const uso = calculateUsage(tables, { exportedAt: exportAt });
      const rep = replay(tables, { exportedAt: exportAt });

      // Critério 2: apenas os registros válidos entram na contagem e período
      expect(uso.totalRecords).toBe(3);
      expect(uso.daysWithRecord).toBe(3);
      expect(uso.firstDay).toBe("2026-10-10");
      expect(uso.lastDay).toBe("2026-10-12");
      expect(uso.futureRecords).toBe(2);

      // Critério 4: apenas 3 embarques avaliados, os futuros não entram
      expect(rep.resumo.total).toBe(3);

      const reportResult: MvpReportResult = {
        file: "backup.json",
        exportedAt: "2026-10-16T12:00:00Z",
        criterio2: uso,
        criterio4: rep,
        futureRecords: uso.futureRecords,
      };

      const text = formatReportText(reportResult);
      expect(text).toContain("3 dias com pelo menos 1 registro, de 2026-10-10 a 2026-10-12, 3 registros ao todo");
      expect(text).toContain("registros datados depois da exportação (relógio de teste): 2");
      expect(text).toContain("Total de embarques avaliados: 3");
    });
  });

  describe("Item 1: Avaliação de linhas oficiais com --seed (bloco 12)", () => {
    it("backup no formato real de exportação (sem tabelas oficiais): sem seed falha com missingSchedule e aviso; com seed avalia 10 embarques", () => {
      const seed = createMinimalSeed();
      const seedTables = seedToBackupTables(seed);

      // Backup no formato real de exportação: APENAS observações do usuário e preferências (sem tabelas oficiais!)
      // As observações apontam para IDs oficiais gerados pelo seed (UUIDv5)
      const lineId = officialId("mobilis/line/1");
      const stopId = officialId("mobilis/stop/S2"); // Arrabalde
      const psId = officialId("mobilis/2026-09-01/pattern/L1/pos/2");
      const tripId = officialId("mobilis/2026-09-01/trip/L1/util/0810");

      // 10 embarques ao vivo em 10 dias úteis (outubro de 2026)
      // No seed: minuto 500 (08:20). Base 500, incerteza [-2, +2], margem 2 -> esteja às 08:16 (minuto 496).
      // Embarques às 08:22 (minuto 502, desvio +2) >= 496 -> todos passam!
      const observations: BackupRow[] = Array.from({ length: 10 }, (_, i) => ({
        id: `obs-real-${i}`,
        created_at: BASE_TIME + i * DAY_MS,
        updated_at: BASE_TIME + i * DAY_MS,
        deleted_at: null,
        source: "user",
        stop_id: stopId,
        line_id: lineId,
        pattern_stop_id: psId,
        trip_id: tripId,
        observed_at: BASE_TIME + i * DAY_MS + (502 - 420) * 60_000,
        observed_end_at: null,
        service_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
        service_minute: 502,
        deviation_min: 2,
        match_status: "auto",
        mode: "live",
        kind: "boarded",
        recorded_at: BASE_TIME + i * DAY_MS,
      }));

      // Formato real do backup: tabelas oficiais NÃO vão no backup
      const realBackupTables = {} as BackupTables;
      for (const t of BACKUP_TABLES) {
        realBackupTables[t] = [];
      }
      realBackupTables.setting = [
        { id: "s-margin", key: "margin_minutes", value: "2", source: "user", created_at: 1, updated_at: 1, deleted_at: null },
      ];
      realBackupTables.observation = observations;
      realBackupTables.official_edits = {};

      // 1. Sem seed: todos os 10 caem em missingSchedule e o aviso do item 4 aparece
      const semSeed = replay(realBackupTables);
      expect(semSeed.resumo.total).toBe(0);
      expect(semSeed.exclusions.missingSchedule).toBe(10);
      expect(semSeed.exclusions.officialWithoutSeed).toBe(10);

      const reportSemSeed = formatReportText({
        file: "backup-rick.json",
        exportedAt: "2026-10-16T12:00:00Z",
        criterio2: { daysWithRecord: 10, firstDay: "2026-10-01", lastDay: "2026-10-10", totalRecords: 10, perDay: {} },
        criterio4: semSeed,
      });
      expect(reportSemSeed).toContain("10 registros em linhas oficiais não podem ser avaliados sem o seed: use --seed <arquivo>");

      // 2. Com seed: todos os 10 embarques são avaliados e passam (10 de 10)
      const comSeed = replay(realBackupTables, { seedTables });
      expect(comSeed.resumo.total).toBe(10);
      expect(comSeed.resumo.passed).toBe(10);
      expect(comSeed.resumo.failed).toBe(0);
      expect(comSeed.resumo.verdict).toBe("passou");
      expect(comSeed.exclusions.missingSchedule).toBe(0);
      expect(comSeed.exclusions.officialWithoutSeed).toBe(0);
      expect(comSeed.boardings[0]!.shouldBeAt).toBe("08:16");
      expect(comSeed.boardings[0]!.passed).toBe(true);

      const reportComSeed = formatReportText({
        file: "backup-rick.json",
        seedFile: "mobilis-2026-09-01.json",
        exportedAt: "2026-10-16T12:00:00Z",
        criterio2: { daysWithRecord: 10, firstDay: "2026-10-01", lastDay: "2026-10-10", totalRecords: 10, perDay: {} },
        criterio4: comSeed,
      });
      expect(reportComSeed).toContain("Seed: mobilis-2026-09-01.json");
      expect(reportComSeed).not.toContain("não podem ser avaliados sem o seed");
    });

    it("registro do Rick editando uma linha oficial (official_edits) vence o seed: horário do backup é o usado", () => {
      // Seed original: horário 500 (08:20)
      const seed = createMinimalSeed({ stopTimeMinute: 500 });
      const seedTables = seedToBackupTables(seed);

      const lineId = officialId("mobilis/line/1");
      const stopId = officialId("mobilis/stop/S2");
      const psId = officialId("mobilis/2026-09-01/pattern/L1/pos/2");
      const tripId = officialId("mobilis/2026-09-01/trip/L1/util/0810");
      const stId = officialId("mobilis/2026-09-01/trip/L1/util/0810/pos/2");

      // Rick editou o horário da linha oficial no app para 520 (08:40)
      const realBackupTables = {} as BackupTables;
      for (const t of BACKUP_TABLES) {
        realBackupTables[t] = [];
      }
      realBackupTables.setting = [
        { id: "s-margin", key: "margin_minutes", value: "2", source: "user", created_at: 1, updated_at: 1, deleted_at: null },
      ];
      realBackupTables.official_edits = {
        stop_time: [
          {
            id: stId,
            created_at: 1,
            updated_at: 2,
            deleted_at: null,
            source: "official_edited",
            official_key: "mobilis/2026-09-01/trip/L1/util/0810/pos/2",
            trip_id: tripId,
            pattern_stop_id: psId,
            service_minute: 520, // 08:40 em vez de 08:20
            origin: "official",
          },
        ],
      };
      realBackupTables.observation = [
        {
          id: "obs-edited-trip",
          created_at: BASE_TIME,
          updated_at: BASE_TIME,
          deleted_at: null,
          source: "user",
          stop_id: stopId,
          line_id: lineId,
          pattern_stop_id: psId,
          trip_id: tripId,
          observed_at: BASE_TIME + (522 - 420) * 60_000,
          observed_end_at: null,
          service_date: "2026-10-01",
          service_minute: 522,
          deviation_min: 2,
          match_status: "auto",
          mode: "live",
          kind: "boarded",
          recorded_at: BASE_TIME,
        },
      ];

      const result = replay(realBackupTables, { seedTables });
      // Com minuto 520 (08:40), incerteza [-2, +2], margem 2:
      // esteja às = 520 - 2 - 2 = 516 (08:36)!
      // Se o seed tivesse vencido o backup (mutação M1), seria 500 - 4 = 496 (08:16).
      expect(result.resumo.total).toBe(1);
      expect(result.boardings[0]!.shouldBeAt).toBe("08:36");
      expect(result.boardings[0]!.passed).toBe(true);
    });

    it("com --seed, se ainda restar registro com ID inexistente, --detalhe diz qual ID falhou", () => {
      const seed = createMinimalSeed();
      const seedTables = seedToBackupTables(seed);

      const lineId = officialId("mobilis/line/1");
      const stopId = officialId("mobilis/stop/S2");
      const tripId = officialId("mobilis/2026-09-01/trip/L1/util/0810");

      const realBackupTables = {} as BackupTables;
      for (const t of BACKUP_TABLES) {
        realBackupTables[t] = [];
      }
      realBackupTables.observation = [
        {
          id: "obs-residual-missing",
          created_at: BASE_TIME,
          updated_at: BASE_TIME,
          deleted_at: null,
          source: "user",
          stop_id: stopId,
          line_id: lineId,
          pattern_stop_id: "ps-inexistente-mesmo-com-seed",
          trip_id: tripId,
          observed_at: BASE_TIME,
          observed_end_at: null,
          service_date: "2026-10-01",
          service_minute: 500,
          deviation_min: 0,
          match_status: "auto",
          mode: "live",
          kind: "boarded",
          recorded_at: BASE_TIME,
        },
      ];

      const result = replay(realBackupTables, { seedTables, detail: true });
      expect(result.resumo.total).toBe(0);
      expect(result.exclusions.missingSchedule).toBe(1);
      expect(result.exclusions.details?.missingSchedule[0]!.qual).toBe("pattern_stop_id");
      expect(result.exclusions.details?.missingSchedule[0]!.detail).toContain("pattern_stop_id");
    });
  });
});

