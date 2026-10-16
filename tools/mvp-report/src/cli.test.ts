import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { officialId, serializeBackup, type BackupInput } from "@notebus/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { createSyntheticBackupText } from "./testing/syntheticBackup.ts";
import { createMinimalSeed } from "./testing/syntheticSeed.ts";
import { sha256Node } from "./validate.ts";

describe("CLI mvp-report: fiação, argumentos e validação (Item 1)", () => {
  const tempDir = join(import.meta.dirname, "__test_tmp__");

  beforeEach(() => {
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("sem argumentos ou com --help: imprime mensagem de uso e sai com código 1", async () => {
    const logs: string[] = [];
    const errs: string[] = [];
    const code = await main([], (s) => logs.push(s), (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join(" ")).toContain("Uso: npm --workspace=@notebus/mvp-report start");
  });

  it("arquivo inexistente: recusa com código 1 e mensagem de erro", async () => {
    const errs: string[] = [];
    const code = await main(["arquivo-que-nao-existe.json"], () => {}, (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join(" ")).toContain("Arquivo não encontrado");
  });

  it("arquivo com JSON inválido: recusa com código 1", async () => {
    const filePath = join(tempDir, "invalid.json");
    writeFileSync(filePath, "não é json", "utf8");
    const errs: string[] = [];
    const code = await main([filePath], () => {}, (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join(" ")).toContain("não é um JSON válido");
  });

  it("adulteração de 1 byte no arquivo: recusa com código 1 (checksum_mismatch)", async () => {
    const text = await createSyntheticBackupText();
    // Altera 1 caractere no texto
    const altered = text.replace('"Linha 1"', '"Linha X"');
    const filePath = join(tempDir, "altered.json");
    writeFileSync(filePath, altered, "utf8");

    const errs: string[] = [];
    const code = await main([filePath], () => {}, (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join(" ")).toContain("Checksum não confere");
  });

  it("formatVersion desconhecida ou inválida: recusa com código 1", async () => {
    const text = await createSyntheticBackupText();
    // Força formatVersion inválida sem quebrar o JSON básico
    const raw = JSON.parse(text);
    raw.formatVersion = 999;
    // Mesmo com checksum novo mas versão desconhecida, recusa
    const { sha256Node } = await import("./validate.ts");
    const zeroChecksum = "sha256:" + "0".repeat(64);
    raw.checksum = zeroChecksum;
    const zeroed = `${JSON.stringify(raw, null, 2)}\n`;
    const digest = sha256Node(zeroed);
    const textWithNewChecksum = zeroed.replace(`"checksum": "${zeroChecksum}"`, `"checksum": "sha256:${digest}"`);

    const filePath = join(tempDir, "unknown-version.json");
    writeFileSync(filePath, textWithNewChecksum, "utf8");

    const errs: string[] = [];
    const code = await main([filePath], () => {}, (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join(" ")).toContain("Versão do backup não suportada");
  });

  it("backup válido: gera relatório com código 0 e exporta JSON se solicitado", async () => {
    const text = await createSyntheticBackupText();
    const backupPath = join(tempDir, "valid-backup.json");
    const jsonOutPath = join(tempDir, "output.json");
    writeFileSync(backupPath, text, "utf8");

    const logs: string[] = [];
    const errs: string[] = [];
    const code = await main([backupPath, "--json", jsonOutPath], (s) => logs.push(s), (s) => errs.push(s));

    expect(code).toBe(0);
    expect(errs).toHaveLength(0);

    const reportText = logs.join("\n");
    expect(reportText).toContain("=== Relatório do MVP NoteBus ===");
    expect(reportText).toContain("--- Critério 2: Uso ao vivo ---");
    expect(reportText).toContain("--- Critério 4: Replay do 'esteja no ponto às' ---");
    expect(reportText).toContain("Limite honesto:");

    expect(existsSync(jsonOutPath)).toBe(true);
    const jsonParsed = JSON.parse(readFileSync(jsonOutPath, "utf8"));
    expect(jsonParsed.file).toBe(backupPath);
    expect(jsonParsed.criterio2).toBeDefined();
    expect(jsonParsed.criterio4).toBeDefined();
  });

  it("opção --detalhe no CLI: inclui o detalhe das exclusões na saída padrão", async () => {
    // Cria backup com uma observação com line_id ausente
    const now = Date.UTC(2026, 9, 10, 10, 0, 0);
    const obs = [
      {
        id: "obs-cli-detail",
        created_at: now,
        updated_at: now,
        deleted_at: null,
        source: "user",
        stop_id: "stop-arrabalde",
        line_id: "line-dataset-inexistente",
        pattern_stop_id: "ps-1",
        trip_id: "trip-0810",
        observed_at: now,
        observed_end_at: null,
        service_date: "2026-10-10",
        service_minute: 494,
        deviation_min: 2,
        match_status: "auto",
        mode: "live",
        kind: "boarded",
        recorded_at: now,
      },
    ];
    const text = await createSyntheticBackupText(obs);
    const backupPath = join(tempDir, "detail-backup.json");
    writeFileSync(backupPath, text, "utf8");

    const logs: string[] = [];
    const code = await main([backupPath, "--detalhe"], (s) => logs.push(s), () => {});

    expect(code).toBe(0);
    const reportText = logs.join("\n");
    expect(reportText).toContain("Detalhe das exclusões:");
    expect(reportText).toContain("- Sem linha ou ponto no dataset (1):");
    expect(reportText).toContain('* ID obs-cli-detail | 2026-10-10 | qual: line_id | valor: line_id="line-dataset-inexistente" (ausente no dataset)');
  });

  it("CLI com registros posteriores à exportação: separa registros do relógio de teste", async () => {
    const exportTime = Date.UTC(2026, 9, 16, 12, 0, 0);
    const pastTime = Date.UTC(2026, 9, 10, 10, 0, 0);
    const futureTime = Date.UTC(2026, 9, 25, 10, 0, 0);

    const obs = [
      {
        id: "obs-past",
        created_at: pastTime,
        updated_at: pastTime,
        deleted_at: null,
        source: "user",
        stop_id: "stop-arrabalde",
        line_id: "line-1",
        pattern_stop_id: "ps-1",
        trip_id: "trip-0810",
        observed_at: pastTime,
        observed_end_at: null,
        service_date: "2026-10-10",
        service_minute: 494,
        deviation_min: 2,
        match_status: "auto",
        mode: "live",
        kind: "boarded",
        recorded_at: pastTime,
      },
      {
        id: "obs-future",
        created_at: futureTime,
        updated_at: futureTime,
        deleted_at: null,
        source: "user",
        stop_id: "stop-arrabalde",
        line_id: "line-1",
        pattern_stop_id: "ps-1",
        trip_id: "trip-0810",
        observed_at: futureTime,
        observed_end_at: null,
        service_date: "2026-10-25",
        service_minute: 494,
        deviation_min: 2,
        match_status: "auto",
        mode: "live",
        kind: "boarded",
        recorded_at: futureTime,
      },
    ];

    const text = await createSyntheticBackupText(obs, {}, { exportedAt: exportTime });
    const backupPath = join(tempDir, "future-clock-backup.json");
    writeFileSync(backupPath, text, "utf8");

    const logs: string[] = [];
    const code = await main([backupPath], (s) => logs.push(s), () => {});

    expect(code).toBe(0);
    const reportText = logs.join("\n");
    expect(reportText).toContain("1 dias com pelo menos 1 registro, de 2026-10-10 a 2026-10-10, 1 registros ao todo");
    expect(reportText).toContain("registros datados depois da exportação (relógio de teste): 1");
    expect(reportText).toContain("Total de embarques avaliados: 1");
  });

  describe("CLI mvp-report: opção --seed (bloco 12)", () => {
    it("texto de ajuda inclui a opção --seed", async () => {
      const errs: string[] = [];
      const code = await main(["--help"], () => {}, (s) => errs.push(s));
      expect(code).toBe(1);
      expect(errs.join(" ")).toContain("[--seed <arquivo-do-seed.json>]");
    });

    it("seed inexistente: erro claro em português e saída 1 sem relatório parcial", async () => {
      const text = await createSyntheticBackupText();
      const backupPath = join(tempDir, "valid-backup.json");
      writeFileSync(backupPath, text, "utf8");

      const logs: string[] = [];
      const errs: string[] = [];
      const code = await main([backupPath, "--seed", "arquivo-inexistente.json"], (s) => logs.push(s), (s) => errs.push(s));

      expect(code).toBe(1);
      expect(logs).toHaveLength(0);
      expect(errs.join(" ")).toContain("Arquivo de seed não encontrado: arquivo-inexistente.json");
    });

    it("seed ilegível ou JSON inválido: erro claro em português e saída 1", async () => {
      const text = await createSyntheticBackupText();
      const backupPath = join(tempDir, "valid-backup.json");
      const seedPath = join(tempDir, "invalid-seed.json");
      writeFileSync(backupPath, text, "utf8");
      writeFileSync(seedPath, "isto não é um json", "utf8");

      const logs: string[] = [];
      const errs: string[] = [];
      const code = await main([backupPath, "--seed", seedPath], (s) => logs.push(s), (s) => errs.push(s));

      expect(code).toBe(1);
      expect(logs).toHaveLength(0);
      expect(errs.join(" ")).toContain("Arquivo de seed não é um JSON válido");
    });

    it("seed com formato inválido (parseSeedFile falha): erro claro em português e saída 1", async () => {
      const text = await createSyntheticBackupText();
      const backupPath = join(tempDir, "valid-backup.json");
      const seedPath = join(tempDir, "wrong-format-seed.json");
      writeFileSync(backupPath, text, "utf8");
      writeFileSync(seedPath, JSON.stringify({ format: "not-a-valid-format" }), "utf8");

      const logs: string[] = [];
      const errs: string[] = [];
      const code = await main([backupPath, "--seed", seedPath], (s) => logs.push(s), (s) => errs.push(s));

      expect(code).toBe(1);
      expect(logs).toHaveLength(0);
      expect(errs.join(" ")).toContain("Formato do arquivo de seed inválido:");
    });

    it("CLI com seed válido: carrega dados oficiais, avalia embarques e exibe Seed no relatório", async () => {
      const seed = createMinimalSeed();
      const lineId = officialId("mobilis/line/1");
      const stopId = officialId("mobilis/stop/S2");
      const psId = officialId("mobilis/2026-09-01/pattern/L1/pos/2");
      const tripId = officialId("mobilis/2026-09-01/trip/L1/util/0810");
      const now = Date.UTC(2026, 9, 10, 8, 22, 0);

      const backupInput: BackupInput = {
        schemaVersion: 5,
        appVersion: "0.9.0",
        exportedAt: Date.UTC(2026, 9, 20, 12, 0, 0),
        network: { name: "MOBILIS Leiria", timezone: "Europe/Lisbon" },
        datasets: [{ name: "mobilis", version: "2026-09-01" }],
        tables: {
          setting: [{ id: "s-margin", key: "margin_minutes", value: "2", source: "user", created_at: 1, updated_at: 1, deleted_at: null }],
          observation: [
            {
              id: "obs-cli-seed-1",
              created_at: now,
              updated_at: now,
              deleted_at: null,
              source: "user",
              stop_id: stopId,
              line_id: lineId,
              pattern_stop_id: psId,
              trip_id: tripId,
              observed_at: now,
              observed_end_at: null,
              service_date: "2026-10-10",
              service_minute: 502,
              deviation_min: 2,
              match_status: "auto",
              mode: "live",
              kind: "boarded",
              recorded_at: now,
            },
          ],
        },
        officialEdits: {},
      };

      const backupText = await serializeBackup(backupInput, sha256Node);
      const backupPath = join(tempDir, "real-official-backup.json");
      const seedPath = join(tempDir, "real-seed.json");
      writeFileSync(backupPath, backupText, "utf8");
      writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf8");

      // 1. Sem --seed: exibe aviso do item 4 e 0 avaliados
      const logsSemSeed: string[] = [];
      const codeSemSeed = await main([backupPath], (s) => logsSemSeed.push(s), () => {});
      expect(codeSemSeed).toBe(0);
      const reportSemSeed = logsSemSeed.join("\n");
      expect(reportSemSeed).toContain("1 registros em linhas oficiais não podem ser avaliados sem o seed: use --seed <arquivo>");
      expect(reportSemSeed).toContain("Total de embarques avaliados: 0");

      // 2. Com --seed: avalia 1 embarque e mostra o Seed no cabeçalho
      const logsComSeed: string[] = [];
      const codeComSeed = await main([backupPath, "--seed", seedPath], (s) => logsComSeed.push(s), () => {});
      expect(codeComSeed).toBe(0);
      const reportComSeed = logsComSeed.join("\n");
      expect(reportComSeed).toContain(`Seed: ${seedPath}`);
      expect(reportComSeed).toContain("Total de embarques avaliados: 1");
      expect(reportComSeed).not.toContain("não podem ser avaliados sem o seed");
    });
  });
});
