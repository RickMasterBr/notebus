/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = () => readFileSync(join(__dirname, "SettingsSheet.tsx"), "utf8").replace(/\r\n/g, "\n");
const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

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
    const posGroupYou = src.indexOf('"settings.group.you"');
    const posName = src.indexOf('"settings.name.title"');
    const posPlaces = src.indexOf('"settings.places.row"');

    const posGroupSchedule = src.indexOf('"settings.group.schedule"');
    const posMargin = src.indexOf('"settings.margin.title"');
    const posDays = src.indexOf('"settings.days.row"');
    const posHolidays = src.indexOf('"settings.holidays.row"');

    const posGroupAlerts = src.indexOf('"settings.group.alerts"');
    const posAlertsAllow = src.indexOf('"settings.alarms.allow"');
    const posAlertsOn = src.indexOf('"settings.alarms.on_row"');

    const posGroupNetwork = src.indexOf('"settings.group.network"');
    const posNetwork = src.indexOf('"settings.network.row"');
    const posMap = src.indexOf('"settings.offline_map.title"');

    const posGroupData = src.indexOf('"settings.group.data"');
    const posBackup = src.indexOf('"settings.data.backup_row"');
    const posVersion = src.indexOf('"settings.version"');

    expect(posGroupYou).toBeGreaterThan(-1);
    expect(posName).toBeGreaterThan(posGroupYou);
    expect(posPlaces).toBeGreaterThan(posName);

    expect(posGroupSchedule).toBeGreaterThan(posPlaces);
    expect(posMargin).toBeGreaterThan(posGroupSchedule);
    expect(posDays).toBeGreaterThan(posMargin);
    expect(posHolidays).toBeGreaterThan(posDays);

    expect(posGroupAlerts).toBeGreaterThan(posHolidays);
    expect(posAlertsAllow).toBeGreaterThan(posGroupAlerts);
    expect(posAlertsOn).toBeGreaterThan(posAlertsAllow);

    expect(posGroupNetwork).toBeGreaterThan(posAlertsOn);
    expect(posNetwork).toBeGreaterThan(posGroupNetwork);
    expect(posMap).toBeGreaterThan(posNetwork);

    expect(posGroupData).toBeGreaterThan(posMap);
    expect(posBackup).toBeGreaterThan(posGroupData);
    expect(posVersion).toBeGreaterThan(posBackup);
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
    expect(src).toMatch(/useOptimisticSwitch\(prefs\.includeMunicipalHolidays,\s*prefs\.setIncludeMunicipalHolidays(,\s*["']feriados["'](,\s*\{\s*deferCommitMs:[^}]*\})?)?\)/);
    expect(src).toMatch(/onValueChange=\{municipalSwitch\.onValueChange\}/);
  });

  it("interruptor de avisos tem onValueChange e exibe off_hint quando desligado", () => {
    const src = stripComments(read());
    expect(src).toMatch(/settings\.alarms\.allow/);
    expect(src).toMatch(/useOptimisticSwitch\(prefs\.alarmsAllowed,\s*handleToggleAlarms(,\s*["']avisos["'])?\)/);
    expect(src).toMatch(
      /t\("settings\.alarms\.allow"\)[\s\S]{1,200}?\{view\.alertsHint\}[\s\S]{1,200}?<NbSwitch\b[^>]*onValueChange=\{alarmsSwitch\.onValueChange\}/,
    );
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
