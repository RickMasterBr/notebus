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

describe("SettingsSheet: ligações da Margem (Mutação 1)", () => {
  it("stepper tem botões - e + com alvos de toque, limites e reversão de falha", () => {
    const src = read();
    // Botão menos passa -1, botão mais passa 1
    expect(src).toMatch(/handleStepMargin\(-1\)/);
    expect(src).toMatch(/handleStepMargin\(1\)/);
    // setMargin chamado com o novo valor
    expect(src).toMatch(/setMargin\(next\.value\)/);
    // Se setMargin devolver false, restaura o valor anterior
    expect(src).toMatch(/if\s*\(!ok\)\s*setMargin\(prev\)/);
    // VoiceOver: adjustable com ações
    expect(src).toMatch(/accessibilityRole="adjustable"/);
    expect(src).toMatch(/name:\s*"increment"/);
    expect(src).toMatch(/name:\s*"decrement"/);
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
