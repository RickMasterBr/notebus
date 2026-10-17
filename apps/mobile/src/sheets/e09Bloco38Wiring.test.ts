/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const repoRoot = process.env.NB_REPO_ROOT ?? join(root, "..", "..", "..");

function getStepContent(workflow: string, stepName: string): string {
  const lines = workflow.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes(`- name: ${stepName}`));
  if (idx === -1) {
    throw new Error(`Passo não encontrado no workflow: ${stepName}`);
  }
  const stepLines: string[] = [];
  for (let i = idx; i < lines.length; i++) {
    if (i > idx && /^\s*-\s+name:/.test(lines[i]!)) {
      break;
    }
    stepLines.push(lines[i]!);
  }
  return stepLines.join("\n");
}

describe("E-09 Bloco 38 · seletores Maestro e resiliência do workflow e2e.yml", () => {
  it('(a) nenhum arquivo de .maestro/*.yaml tem a linha text: "Registrar" exata', () => {
    const maestroDir = join(repoRoot, ".maestro");
    const yamlFiles = readdirSync(maestroDir).filter((f) => f.endsWith(".yaml"));

    expect(yamlFiles.length).toBeGreaterThan(0);

    for (const file of yamlFiles) {
      const content = readFileSync(join(maestroDir, file), "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        expect(
          /^\s*text:\s*"Registrar"\s*$/.test(line),
          `Arquivo ${file}:${i + 1} contém seletor exato 'text: "Registrar"'`,
        ).toBe(false);
      }
    }
  });

  it("(b) e2e.yml tem id: sim no simulador e as quatro condições steps.sim.outcome == 'success'", () => {
    const e2eYml = readFileSync(join(repoRoot, ".github", "workflows", "e2e.yml"), "utf8");

    const simStep = getStepContent(e2eYml, "Inicializar Simulador iOS e Instalar App");
    expect(simStep).toMatch(/^\s*id:\s*sim\s*$/m);

    const flowStepNames = [
      "M-1 (T-92) Registrar L1 na Arrabalde",
      "M-2 (T-93) Atalho Facul",
      "M-3 (T-94) Está indo ou voltando?",
      "Dynamic Type (T-95) em 5 tamanhos",
    ];

    for (const name of flowStepNames) {
      const step = getStepContent(e2eYml, name);
      expect(
        step,
        `Passo '${name}' não tem condição steps.sim.outcome == 'success'`,
      ).toContain("steps.sim.outcome == 'success'");
      expect(
        step,
        `Passo '${name}' não tem condição !cancelled()`,
      ).toContain("!cancelled()");
    }
  });

  it("(c) e2e.yml tem o upload maestro-debug com if: always()", () => {
    const e2eYml = readFileSync(join(repoRoot, ".github", "workflows", "e2e.yml"), "utf8");

    const copyStep = getStepContent(e2eYml, "Copiar depuração do Maestro");
    expect(copyStep).toMatch(/^\s*if:\s*always\(\)\s*$/m);
    expect(copyStep).toContain("mkdir -p maestro-debug");
    expect(copyStep).toContain("maestro-debug/");

    const uploadStep = getStepContent(e2eYml, "Salvar depuração do Maestro como artefato");
    expect(uploadStep).toMatch(/^\s*if:\s*always\(\)\s*$/m);
    expect(uploadStep).toContain("name: maestro-debug");
    expect(uploadStep).toContain("path: maestro-debug/");
    expect(uploadStep).toContain("if-no-files-found: ignore");
  });

  it('(d) m3-indo-ou-voltando.yaml não tem seletores exatos text: "Casa" nem text: "Facul" sem .*', () => {
    const m3Content = readFileSync(join(repoRoot, ".maestro", "m3-indo-ou-voltando.yaml"), "utf8");
    const lines = m3Content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      expect(
        /^\s*text:\s*"(?:Casa|Facul)"\s*$/.test(line),
        `m3-indo-ou-voltando.yaml:${i + 1} contém seletor exato sem .*: ${line.trim()}`,
      ).toBe(false);
    }
  });
});
