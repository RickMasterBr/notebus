/// <reference types="node" />
/**
 * Guardas estáticos de uso das novas ligações (TL-11, E-08 bloco 1d, Item 6).
 * Lê o código-fonte dos componentes afetados e confere o USO exato (regra de ouro de AGENTS.md).
 * Sem comentários no texto analisado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) =>
  readFileSync(join(__dirname, "..", rel), "utf8").replace(/\r\n/g, "\n");

export function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

const settingsSheetSrc = stripComments(read("sheets/SettingsSheet.tsx"));
const alarmsSheetSrc = stripComments(read("sheets/AlarmsSheet.tsx"));
const overrideSheetSrc = stripComments(read("sheets/OverrideSheet.tsx"));
const holidaySheetSrc = stripComments(read("sheets/HolidaySheet.tsx"));
const networkInfoSheetSrc = stripComments(read("sheets/NetworkInfoSheet.tsx"));
const lineDetailSheetSrc = stripComments(read("sheets/LineDetailSheet.tsx"));
const networkSheetSrc = stripComments(read("sheets/NetworkSheet.tsx"));

describe("wiringE08d: guardas de uso das novas ligações (Item 6)", () => {
  describe("1. SettingsSheet: wiring do marginStepper", () => {
    it("handleStepMargin delega a stepper.step com dir", () => {
      const match = settingsSheetSrc.match(
        /const\s+handleStepMargin\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\};/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/stepper\.step\(\s*dir\s*\)/);
    });

    it("useEffect com dependência [prefs.margin] chama stepper.sync(prefs.margin)", () => {
      expect(settingsSheetSrc).toMatch(
        /useEffect\(\s*\(\)\s*=>\s*\{\s*stepper\.sync\(\s*prefs\.margin\s*\);\s*\}\s*,\s*\[prefs\.margin/s,
      );
    });

    it("stepper é instanciado dentro de useRef (não a cada render)", () => {
      expect(settingsSheetSrc).toMatch(
        /const\s+stepperRef\s*=\s*useRef[\s\S]*?\(null\);[\s\S]*?if\s*\(!stepperRef\.current\)\s*\{\s*stepperRef\.current\s*=\s*createMarginStepper\(/,
      );
      expect(settingsSheetSrc).toMatch(/const\s+stepper\s*=\s*stepperRef\.current;/);
    });

    it("0.5: createMarginStepper recebe initial: prefs.margin, show com setMargin e write com prefs.setMargin", () => {
      const match = settingsSheetSrc.match(
        /createMarginStepper\(\s*\{([\s\S]*?)\}\s*\)/,
      );
      expect(match).not.toBeNull();
      const body = match![1];
      expect(body).toMatch(/initial:\s*prefs\.margin/);
      expect(body).toMatch(/show:\s*\([^)]*\)\s*=>\s*setMarginRef\.current/);
      expect(body).toMatch(/write:\s*\([^)]*\)\s*=>\s*prefsRef\.current\.setMargin/);
    });
  });

  describe("2. AlarmsSheet: uso de testAlarmToastKey e repasse ao toast", () => {
    it("testAlarmToastKey é chamado com o resultado do alarme e repassado ao toast", () => {
      expect(alarmsSheetSrc).toMatch(
        /const\s+key\s*=\s*testAlarmToastKey\(\s*result\s*\);/,
      );
      expect(alarmsSheetSrc).toMatch(/toast\.show\(\{\s*title:\s*t\(\s*key!/);
      expect(alarmsSheetSrc).toMatch(/toast\.show\(\{\s*title:\s*t\(\s*key\s*\)\s*\}\);/);
    });
  });

  describe("3. OverrideSheet e HolidaySheet: submitGuard.run embrulha o salvamento", () => {
    it("OverrideSheet embrulha o corpo do handleSave em submitGuard.run", () => {
      const match = overrideSheetSrc.match(
        /const\s+handleSave\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(
        /await\s+submitGuard\.run\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*calendarEdits\.saveOverride\(/,
      );
    });

    it("HolidaySheet embrulha o corpo do handleSave em submitGuard.run", () => {
      const match = holidaySheetSrc.match(
        /const\s+handleSave\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(
        /await\s+submitGuard\.run\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*calendarEdits\.saveHoliday\(/,
      );
    });
  });

  describe("4. NetworkInfoSheet e SettingsSheet: validFrom calculado e formatado", () => {
    it("SettingsSheet calcula validFrom com currentValidFrom(timetables, todayLisbon)", () => {
      expect(settingsSheetSrc).toMatch(
        /const\s+validFrom\s*=\s*currentValidFrom\(\s*timetables\s*,\s*todayLisbon\s*\);/,
      );
      expect(settingsSheetSrc).toMatch(
        /dataset:\s*\{\s*version:\s*latestDataset\.version,\s*validFrom\s*\}/,
      );
    });

    it("NetworkInfoSheet calcula validFrom com currentValidFrom e exibe via validFromText", () => {
      expect(networkInfoSheetSrc).toMatch(
        /const\s+validFromStr\s*=\s*currentValidFrom\(\s*timetables\s*,\s*todayLisbon\s*\);/,
      );
      expect(networkInfoSheetSrc).toMatch(
        /validFrom:\s*validFromText\(\s*validFromStr\s*\)\s*\?\?\s*unknown/,
      );
    });

    it("LineDetailSheet formata timesResult.validFrom com validFromText", () => {
      expect(lineDetailSheetSrc).toMatch(
        /validFromText\(\s*timesResult\.validFrom\s*\)/,
      );
    });
  });

  describe("5. LineDetailSheet: cSet, relógio para defaultDayType, partialCount e recálculo", () => {
    it("cSet de controlPositions marca o ponto de controle", () => {
      expect(lineDetailSheetSrc).toMatch(
        /const\s+cSet\s*=\s*snapPattern\s*\?\s*controlPositions\(snapPattern,\s*snapTrips\)\s*:\s*new\s+Set<number>\(\);/,
      );
      expect(lineDetailSheetSrc).toMatch(
        /const\s+isControl\s*=\s*cSet\.size\s*>\s*0\s*\?\s*cSet\.has\(stop\.position\)\s*:\s*stop\.isTimepoint;/,
      );
      expect(lineDetailSheetSrc).toMatch(
        /\{isControl\s*&&\s*\(\s*<Text[^>]*>\s*\{t\("net\.pattern\.control"\)\}\s*<\/Text>\s*\)\}/,
      );
    });

    it("defaultDayType é calculado a partir de dayTypeOf com data derivada de now()", () => {
      expect(lineDetailSheetSrc).toMatch(
        /const\s+nowMs\s*=\s*now\(\);/,
      );
      expect(lineDetailSheetSrc).toMatch(
        /const\s+todayLisbon\s*=\s*useMemo\(\s*\(\)\s*=>\s*lisbonWallClock\(nowMs\)\.date,\s*\[nowMs\]\);/,
      );
      expect(lineDetailSheetSrc).toMatch(
        /dayTypeOf\(todayLisbon,\s*snapshot\.calendar\)\.dayType/,
      );
      expect(lineDetailSheetSrc).toMatch(
        /useState<DayTypeCode>\(defaultDayType\);/,
      );
    });

    it("aviso de percurso parcial depende de timesResult.partialCount > 0", () => {
      expect(lineDetailSheetSrc).toMatch(
        /\{timesResult\s*&&\s*timesResult\.partialCount\s*>\s*0\s*\?\s*\(\s*<Text[^>]*>\s*\{t\("net\.times\.partial_note",\s*\{\s*n:\s*timesResult\.partialCount\s*\}\)\}\s*<\/Text>\s*\)\s*:\s*null\}/,
      );
    });

    it("recalcula baseTimes dependendo de selectedDayType", () => {
      expect(lineDetailSheetSrc).toMatch(
        /const\s+timesResult\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*?baseTimes\(\{[\s\S]*?dayType:\s*selectedDayType,[\s\S]*?\}\);[\s\S]*?\},\s*\[[^\]]*selectedDayType[^\]]*\]\);/,
      );
    });
  });

  describe("6. NetworkSheet: officialTag com fontes certas e estrutura corrigida", () => {
    it("officialTag é chamado com line.source e com stop.source", () => {
      expect(networkSheetSrc).toMatch(/officialTag\(\s*line\.source\s*\)/);
      expect(networkSheetSrc).toMatch(/officialTag\(\s*stop\.source\s*\)/);
    });

    it("não existe nameAndTag em todo o arquivo", () => {
      expect(networkSheetSrc.includes("nameAndTag")).toBe(false);
    });

    it("officialTag fica após rowContent como filho direto de row (linhas)", () => {
      expect(networkSheetSrc).toMatch(
        /<View\s+style=\{styles\.rowContent\}>[\s\S]*?<\/View>\s*\{officialTag\(line\.source\)\s*&&\s*\(/,
      );
    });

    it("officialTag fica após rowContent como filho direto de row (paragens)", () => {
      expect(networkSheetSrc).toMatch(
        /<View\s+style=\{styles\.rowContent\}>[\s\S]*?<\/View>\s*\{officialTag\(stop\.source\)\s*&&\s*\(/,
      );
    });
  });

  describe("7. Estilos de checksumRow e officialTag (item 0.6)", () => {
    it("checksumRow em NetworkInfoSheet não tem backgroundColor", () => {
      const match = networkInfoSheetSrc.match(/checksumRow:\s*\{([^}]*)\}/);
      expect(match).not.toBeNull();
      expect(match![1]).not.toMatch(/backgroundColor/);
    });

    it("officialTag em NetworkSheet tem flexShrink: 0", () => {
      const match = networkSheetSrc.match(/officialTag:\s*\{([^}]*)\}/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/flexShrink:\s*0/);
    });
  });
});
