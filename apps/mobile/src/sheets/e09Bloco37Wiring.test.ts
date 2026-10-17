/// <reference types="node" />
import { readFileSync } from "node:fs";
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

describe("E-09 Bloco 37 · inicialização do simulador iOS no workflow e2e.yml", () => {
  it("(a) extrai o UDID via grep -oE com padrão de UUID e não usa awk por delimitador de parênteses", () => {
    const e2eYml = readFileSync(join(repoRoot, ".github", "workflows", "e2e.yml"), "utf8");
    const step = getStepContent(e2eYml, "Inicializar Simulador iOS e Instalar App");

    expect(step).toContain("grep -oE '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'");
    expect(step).not.toContain("awk -F '[()]'");
  });

  it("(b) espera o simulador terminar de ligar com bootstatus -b", () => {
    const e2eYml = readFileSync(join(repoRoot, ".github", "workflows", "e2e.yml"), "utf8");
    const step = getStepContent(e2eYml, "Inicializar Simulador iOS e Instalar App");

    expect(step).toMatch(/xcrun simctl bootstatus "\$DEVICE_UDID" -b/);
  });

  it("(c) falha com exit 1 e lista simuladores se DEVICE_UDID estiver vazio", () => {
    const e2eYml = readFileSync(join(repoRoot, ".github", "workflows", "e2e.yml"), "utf8");
    const step = getStepContent(e2eYml, "Inicializar Simulador iOS e Instalar App");

    expect(step).toContain('-z "$DEVICE_UDID"');
    expect(step).toMatch(/xcrun simctl list devices available\s*\|\s*head\s+(-n\s+)?40/);
    const checkIdx = step.indexOf('-z "$DEVICE_UDID"');
    const exitIdx = step.indexOf("exit 1", checkIdx);
    expect(exitIdx).toBeGreaterThan(checkIdx);
  });
});
