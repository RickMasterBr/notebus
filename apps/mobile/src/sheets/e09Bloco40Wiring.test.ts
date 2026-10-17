/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const repoRoot = process.env.NB_REPO_ROOT ?? join(root, "..", "..", "..");

interface MaestroStep {
  command: string;
  raw: string;
  line: number;
}

function parseMaestroSteps(content: string): MaestroStep[] {
  const lines = content.split(/\r?\n/);
  const steps: MaestroStep[] = [];
  let currentStep: { command: string; lines: string[]; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/^-\s*([a-zA-Z0-9]+):/);
    if (match && match[1]) {
      if (currentStep) {
        steps.push({
          command: currentStep.command,
          raw: currentStep.lines.join("\n"),
          line: currentStep.startLine,
        });
      }
      currentStep = {
        command: match[1],
        lines: [line],
        startLine: i + 1,
      };
    } else if (currentStep) {
      currentStep.lines.push(line);
    }
  }

  if (currentStep) {
    steps.push({
      command: currentStep.command,
      raw: currentStep.lines.join("\n"),
      line: currentStep.startLine,
    });
  }

  return steps;
}

function checkFlowArrabaldeSwipe(file: string) {
  const filePath = join(repoRoot, ".maestro", file);
  const content = readFileSync(filePath, "utf8");
  const steps = parseMaestroSteps(content);

  const tapOnIndex = steps.findIndex(
    (s) => s.command === "tapOn" && /text:\s*"Arrabalde\.\*"/.test(s.raw),
  );
  expect(
    tapOnIndex,
    `${file}: deve conter um primeiro - tapOn com text: "Arrabalde.*"`,
  ).toBeGreaterThanOrEqual(0);

  const tapOnStep = steps[tapOnIndex]!;

  const swipeIndex = steps.findIndex(
    (s) => s.command === "swipe" && s.line < tapOnStep.line,
  );
  expect(
    swipeIndex,
    `${file}: deve conter um - swipe antes do primeiro - tapOn de Arrabalde.*`,
  ).toBeGreaterThanOrEqual(0);

  const waitIndex = steps.findIndex(
    (s) =>
      s.command === "extendedWaitUntil" &&
      /text:\s*"Arrabalde\.\*"/.test(s.raw) &&
      s.line < tapOnStep.line,
  );
  expect(
    waitIndex,
    `${file}: deve conter um - extendedWaitUntil com text: "Arrabalde.*" antes do primeiro - tapOn de Arrabalde.*`,
  ).toBeGreaterThanOrEqual(0);

  expect(
    swipeIndex,
    `${file}: o - swipe (passo #${swipeIndex + 1}) deve vir antes do - extendedWaitUntil (passo #${waitIndex + 1})`,
  ).toBeLessThan(waitIndex);

  const swipeStep = steps[swipeIndex]!;
  expect(swipeStep.raw).toContain("start: 50%, 65%");
  expect(swipeStep.raw).toContain("end: 50%, 20%");

  const waitStep = steps[waitIndex]!;
  expect(waitStep.raw).toContain("timeout: 8000");
}

describe("E-09 Bloco 40 · Maestro: swipe e espera antes de tocar no cartão Arrabalde", () => {
  it("m3-indo-ou-voltando.yaml tem swipe e extendedWaitUntil antes do primeiro tapOn Arrabalde.*", () => {
    checkFlowArrabaldeSwipe("m3-indo-ou-voltando.yaml");
  });

  it("dynamic-type.yaml tem swipe e extendedWaitUntil antes do primeiro tapOn Arrabalde.*", () => {
    checkFlowArrabaldeSwipe("dynamic-type.yaml");
  });
});
