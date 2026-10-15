/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readHoliday = () =>
  readFileSync(join(__dirname, "HolidaySheet.tsx"), "utf8").replace(/\r\n/g, "\n");
const readSettings = () =>
  readFileSync(join(__dirname, "SettingsSheet.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("HolidaySheet: ligações e regras (Item 5)", () => {
  it("salvar chama saveHoliday com recurring e trata created e recusas", () => {
    const src = readHoliday();
    expect(src).toMatch(/saveHoliday\(/);
    expect(src).toMatch(/holiday\.saved/);
    expect(src).toMatch(/toast\.action\.undo/);
    expect(src).toMatch(/holiday\.error\.name/);
    expect(src).toMatch(/holiday\.error\.date/);
  });

  it("interruptor Repete todo ano tem onValueChange ligado a recurring", () => {
    const src = readHoliday();
    expect(src).toMatch(/holiday\.every_year/);
    expect(src).toMatch(/onValueChange=\{[^}]*setRecurring/);
  });
});

const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

describe("SettingsSheet: ligações de feriados (Item 5)", () => {
  it("lê feriados com listHolidays e só permite apagar feriados manuais", () => {
    const src = stripComments(readSettings());
    const actionsSrc = stripComments(
      readFileSync(join(__dirname, "../data/settingsActions.ts"), "utf8").replace(/\r\n/g, "\n"),
    );
    expect(src).toMatch(/listHolidays\(/);
    expect(src).toMatch(
      /deleteHolidayWithUndo\(\{[\s\S]*?deleteHoliday:\s*\(id,\s*at\)\s*=>\s*calendarEdits\.deleteHoliday\(id,\s*at\)/,
    );
    expect(actionsSrc).toMatch(/holiday\.deleted/);
    expect(src).toMatch(/settings\.holiday\.official_note/);
    // Gesto de apagar condicionado ao escopo manual
    expect(src).toMatch(/item\.scope === "manual"/);
  });
});
