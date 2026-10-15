import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { createSyntheticBackupText } from "./testing/syntheticBackup.ts";

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
});
