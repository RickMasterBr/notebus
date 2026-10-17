/** E-09 bloco 22: os dois interruptores de Ajustes usam o NbSwitch (FN-23). Confere o USO, texto sem comentários. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync(new URL("./SettingsSheet.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
  .replace(/\s+/g, " ");

describe("E-09 bloco 22: Ajustes sem o Switch nativo", () => {
  it("(a) feriados municipais: NbSwitch com municipalSwitch", () => {
    expect(settings).toMatch(
      /<NbSwitch accessibilityLabel=\{t\("settings\.holiday\.municipal"\)\} value=\{municipalSwitch\.value\} onValueChange=\{municipalSwitch\.onValueChange\} diagLabel="feriados" \/>/,
    );
  });
  it("(b) avisos: NbSwitch com alarmsSwitch", () => {
    expect(settings).toMatch(
      /<NbSwitch accessibilityLabel=\{t\("settings\.alarms\.allow"\)\} value=\{alarmsSwitch\.value\} onValueChange=\{alarmsSwitch\.onValueChange\} diagLabel="avisos" \/>/,
    );
  });
  it("(c) nenhum <Switch nativo sobra no arquivo", () => {
    expect(settings).not.toMatch(/<Switch\b/);
  });
  it("(d) useOptimisticSwitch continua ligado aos dois", () => {
    expect(settings).toContain('useOptimisticSwitch(prefs.includeMunicipalHolidays, prefs.setIncludeMunicipalHolidays, "feriados", { deferCommitMs: SWITCH_ANIM_MS + 30, })');
    expect(settings).toContain('useOptimisticSwitch(prefs.alarmsAllowed, handleToggleAlarms, "avisos")');
  });
});
