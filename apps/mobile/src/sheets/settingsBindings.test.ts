/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = () => readFileSync(join(__dirname, "SettingsSheet.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("SettingsSheet: quadro de rolagem e estrutura TL-12", () => {
  it("usa BottomSheetScrollView com HeightContext e DETENTS a 82%", () => {
    const src = read();
    expect(src).toMatch(/snapPoints:\s*\["82%"\]/);
    expect(src).toMatch(/<BottomSheetScrollView/);
    expect(src).toMatch(/detentMetrics\(/);
    expect(src).toMatch(/containerHeightOf\(/);
  });

  it("apresenta as seções na ordem do plano §3", () => {
    const src = read();
    const posPlaces = src.indexOf('"places"');
    const posGeneral = src.indexOf('"settings.section.general"');
    const posDays = src.indexOf('"settings.section.days"');
    const posHolidays = src.indexOf('"settings.section.holidays"');
    const posAlerts = src.indexOf('"settings.section.alerts"');
    const posMap = src.indexOf('"settings.section.map"');
    const posData = src.indexOf('"settings.section.data"');
    const posNetwork = src.indexOf('"settings.section.network"');
    const posAbout = src.indexOf('"settings.section.about"');

    expect(posPlaces).toBeGreaterThan(-1);
    expect(posGeneral).toBeGreaterThan(posPlaces);
    expect(posDays).toBeGreaterThan(posGeneral);
    expect(posHolidays).toBeGreaterThan(posDays);
    expect(posAlerts).toBeGreaterThan(posHolidays);
    expect(posMap).toBeGreaterThan(posAlerts);
    expect(posData).toBeGreaterThan(posMap);
    expect(posNetwork).toBeGreaterThan(posData);
    expect(posAbout).toBeGreaterThan(posNetwork);
  });
});

const readMarginStepper = () => readFileSync(join(__dirname, "MarginStepper.tsx"), "utf8").replace(/\r\n/g, "\n");
const readMarginStepperData = () => readFileSync(join(__dirname, "../data/marginStepper.ts"), "utf8").replace(/\r\n/g, "\n");

describe("MarginStepper: ligações da Margem (Mutação 1)", () => {
  it("stepper tem botões - e + com alvos de toque, limites e reversão de falha", () => {
    const src = readMarginStepper();
    const dataSrc = readMarginStepperData();
    // Botão menos passa -1, botão mais passa 1
    expect(src).toMatch(/settings\.margin\.less[\s\S]{1,150}handleStepMargin\(-1\)/);
    expect(src).toMatch(/settings\.margin\.more[\s\S]{1,150}handleStepMargin\(1\)/);
    // Feedback imediato no código puro do stepper (código real, não comentário):
    expect(dataSrc).toMatch(/currentShown\s*=\s*next\.value;\s*show\(currentShown\)/);
    // Se write devolver false, restaura o valor confirmado no código puro do stepper (código real, não comentário):
    expect(dataSrc).toMatch(/if\s*\(!ok\)\s*\{[\s\S]*?show\(currentShown\)/);
    // VoiceOver: adjustable com ações
    expect(src).toMatch(/accessibilityRole="adjustable"/);
    expect(src).toMatch(/name:\s*"increment"/);
    expect(src).toMatch(/name:\s*"decrement"/);
  });

  it("SettingsSheet renderiza <MarginStepper e não tem mais createMarginStepper nem estado local de margem", () => {
    const sheetSrc = read();
    expect(sheetSrc).toMatch(/<MarginStepper\s*\/>/);
    expect(sheetSrc).not.toMatch(/createMarginStepper/);
    expect(sheetSrc).not.toMatch(/useState\([^)]*prefs\.margin\)/);
  });
});

describe("SettingsSheet: interruptores (Mutação 2)", () => {
  it("interruptor municipal tem onValueChange ligado a setIncludeMunicipalHolidays", () => {
    const src = read();
    expect(src).toMatch(/setIncludeMunicipalHolidays/);
    expect(src).toMatch(/onValueChange=\{[^}]*setIncludeMunicipalHolidays/);
  });

  it("interruptor de avisos tem onValueChange e exibe off_hint quando desligado", () => {
    const src = read();
    expect(src).toMatch(/settings\.alarms\.allow/);
    expect(src).toMatch(/settings\.alarms\.off_hint/);
  });

  it("interruptor de avisos segue o fluxo de dois passos (alarmsSwitchDecision, motivo e denied)", () => {
    const src = read();
    expect(src).toMatch(/alarmsSwitchDecision\(/);
    expect(src).toMatch(/mode:\s*"reason"/);
    expect(src).toMatch(/mode:\s*"denied"/);
    expect(src).toMatch(/setAlarmsAllowed\(true\)/);
    expect(src).toMatch(/setAlarmsAllowed\(false\)/);
  });
});

describe("SettingsSheet: dados e rede", () => {
  it("exportação de backup usa backupDaysText", () => {
    const src = read();
    expect(src).toMatch(/backupDaysText\(/);
  });

  it("seção de rede usa networkLine e abre networkInfo", () => {
    const src = read();
    expect(src).toMatch(/networkLine\(/);
    expect(src).toMatch(/kind:\s*"networkInfo"/);
  });
});
