/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StopCard } from "../data/stopCard";
import { cardA11y } from "../data/stopCardText";
import type { PassageRow } from "../data/stopDay";
import { rowA11y } from "../data/stopDayText";

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

function checkFlowSettleBeforeAction(file: string) {
  const filePath = join(repoRoot, ".maestro", file);
  const content = readFileSync(filePath, "utf8");
  const steps = parseMaestroSteps(content);

  const launchAppIndex = steps.findIndex((s) => s.command === "launchApp");
  expect(
    launchAppIndex,
    `${file}: deve conter um - launchApp`,
  ).toBeGreaterThanOrEqual(0);
  const launchAppStep = steps[launchAppIndex]!;

  const firstActionIndex = steps.findIndex(
    (s) => (s.command === "tapOn" || s.command === "swipe") && s.line > launchAppStep.line,
  );
  expect(
    firstActionIndex,
    `${file}: deve conter um primeiro toque ou swipe após o launchApp`,
  ).toBeGreaterThan(launchAppIndex);
  const firstActionStep = steps[firstActionIndex]!;

  const waitIndex = steps.findIndex(
    (s) =>
      s.command === "extendedWaitUntil" &&
      /text:\s*"Registrar\.\*"/.test(s.raw) &&
      s.line > launchAppStep.line &&
      s.line < firstActionStep.line,
  );
  expect(
    waitIndex,
    `${file}: deve conter - extendedWaitUntil com text: "Registrar.*" entre launchApp e o primeiro toque/swipe`,
  ).toBeGreaterThanOrEqual(0);

  const animIndex = steps.findIndex(
    (s) =>
      s.command === "waitForAnimationToEnd" &&
      s.line > steps[waitIndex]!.line &&
      s.line < firstActionStep.line,
  );
  expect(
    animIndex,
    `${file}: deve conter - waitForAnimationToEnd após o extendedWaitUntil e antes do primeiro toque/swipe`,
  ).toBeGreaterThanOrEqual(0);

  expect(
    waitIndex,
    `${file}: - extendedWaitUntil deve vir antes de - waitForAnimationToEnd`,
  ).toBeLessThan(animIndex);
}

function checkFlowPassageRowSwipeAndTap(file: string) {
  const filePath = join(repoRoot, ".maestro", file);
  const content = readFileSync(filePath, "utf8");
  const steps = parseMaestroSteps(content);

  // Não existe tapOn com text: ".*Linha 1.*"
  const deprecatedTap = steps.find(
    (s) => s.command === "tapOn" && /text:\s*"\.\*Linha 1\.\*"/.test(s.raw),
  );
  expect(
    deprecatedTap,
    `${file}: não deve conter tapOn com text: ".*Linha 1.*"`,
  ).toBeUndefined();

  const tapArrabaldeIndex = steps.findIndex(
    (s) => s.command === "tapOn" && /text:\s*"Arrabalde\.\*"/.test(s.raw),
  );
  expect(
    tapArrabaldeIndex,
    `${file}: deve conter tapOn com text: "Arrabalde.*"`,
  ).toBeGreaterThanOrEqual(0);
  const tapArrabaldeStep = steps[tapArrabaldeIndex]!;

  const swipeIndex = steps.findIndex(
    (s) =>
      s.command === "swipe" &&
      /start:\s*50%,\s*68%/.test(s.raw) &&
      s.line > tapArrabaldeStep.line,
  );
  expect(
    swipeIndex,
    `${file}: deve conter - swipe com start: 50%, 68% após o tapOn de Arrabalde.*`,
  ).toBeGreaterThanOrEqual(0);
  const swipeStep = steps[swipeIndex]!;
  expect(swipeStep.raw).toContain("end: 50%, 20%");

  const waitLineIndex = steps.findIndex(
    (s) =>
      s.command === "extendedWaitUntil" &&
      /text:\s*"Linha 1, para Casa, \.\*"/.test(s.raw) &&
      s.line > swipeStep.line,
  );
  expect(
    waitLineIndex,
    `${file}: deve conter - extendedWaitUntil com text: "Linha 1, para Casa, .*" após o swipe`,
  ).toBeGreaterThanOrEqual(0);
  const waitLineStep = steps[waitLineIndex]!;

  const tapLineIndex = steps.findIndex(
    (s) =>
      s.command === "tapOn" &&
      /text:\s*"Linha 1, para Casa, \.\*"/.test(s.raw) &&
      s.line > waitLineStep.line,
  );
  expect(
    tapLineIndex,
    `${file}: deve conter - tapOn com text: "Linha 1, para Casa, .*" após o extendedWaitUntil`,
  ).toBeGreaterThanOrEqual(0);

  expect(swipeIndex).toBeLessThan(waitLineIndex);
  expect(waitLineIndex).toBeLessThan(tapLineIndex);
}

describe("E-09 Bloco 41 · Maestro: esperar a Início assentar e tocar na linha certa do ponto", () => {
  describe("(a) assentar folha antes de agir (m1, m2, m3)", () => {
    it("m1-registrar.yaml tem extendedWaitUntil e waitForAnimationToEnd antes do primeiro toque", () => {
      checkFlowSettleBeforeAction("m1-registrar.yaml");
    });

    it("m2-facul.yaml tem extendedWaitUntil e waitForAnimationToEnd antes do primeiro toque", () => {
      checkFlowSettleBeforeAction("m2-facul.yaml");
    });

    it("m3-indo-ou-voltando.yaml tem extendedWaitUntil e waitForAnimationToEnd antes do primeiro swipe", () => {
      checkFlowSettleBeforeAction("m3-indo-ou-voltando.yaml");
    });
  });

  describe("(b) tocar na linha de passagem com swipe e seletor discriminado (m3 e dynamic-type)", () => {
    it("m3-indo-ou-voltando.yaml não usa tapOn .*Linha 1.* e usa swipe + wait + tap da linha de passagem", () => {
      checkFlowPassageRowSwipeAndTap("m3-indo-ou-voltando.yaml");
    });

    it("dynamic-type.yaml não usa tapOn .*Linha 1.* e usa swipe + wait + tap da linha de passagem", () => {
      checkFlowPassageRowSwipeAndTap("dynamic-type.yaml");
    });
  });

  describe("(c) discriminação comportamental: rowA11y casa o seletor e cardA11y não casa", () => {
    it("seletor 'Linha 1, para Casa, .*' casa rowA11y inteira e rejeita cardA11y", () => {
      const selectorRegex = /^(?:Linha 1, para Casa, .*)$/;

      const passageRow: PassageRow = {
        key: "2026-09-03/t1/1",
        tripId: "t1",
        position: 1,
        time: "22:00",
        rangeStart: "21:56",
        rangeEnd: "22:04",
        beAtStop: "21:54",
        confidence: "estimated",
        number: null,
        isNext: true,
        mayPassNow: false,
        isFirst: false,
        isLast: false,
        origin: null,
        destination: null,
        tripDestination: "Casa",
      };

      const passageLabel = rowA11y({ code: "1" }, passageRow);
      expect(passageLabel).toMatch(selectorRegex);

      const card: StopCard = {
        stopId: "stop-arrabalde",
        name: "Arrabalde",
        lines: [
          {
            code: "1",
            color: "#7A3FF2",
            destination: "Casa",
            state: {
              status: "next",
              time: "22:00",
              rangeStart: "21:56",
              rangeEnd: "22:04",
              beAtStop: "21:54",
              confidence: "estimated",
              mayPassNow: false,
            },
          },
        ],
      };

      const cardLabelWithoutSubtitle = cardA11y(card);
      expect(selectorRegex.test(cardLabelWithoutSubtitle)).toBe(false);

      const cardLabelWithSubtitle = cardA11y(card, "sair às 21:50 · Casa");
      expect(selectorRegex.test(cardLabelWithSubtitle)).toBe(false);
    });
  });
});
