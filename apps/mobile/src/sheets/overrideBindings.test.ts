/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readOverride = () =>
  readFileSync(join(__dirname, "OverrideSheet.tsx"), "utf8").replace(/\r\n/g, "\n");
const readPast = () =>
  readFileSync(join(__dirname, "PastOverridesSheet.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("OverrideSheet: ligações e regras (Item 4)", () => {
  it("salvar chama saveOverride e trata created, replaced e recusa sob o campo", () => {
    const src = readOverride();
    expect(src).toMatch(/saveOverride\(/);
    // created gera toast override.saved e undo
    expect(src).toMatch(/override\.saved/);
    expect(src).toMatch(/toast\.action\.undo/);
    // replaced gera toast override.replaced
    expect(src).toMatch(/override\.replaced/);
    // recusa não fecha a folha e exibe erro sob o campo
    expect(src).toMatch(/override\.error\.date/);
    expect(src).toMatch(/override\.error\.generic/);
    // Conversão de data usa toLocalDateString e não toISOString
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });

  it("botão salvar fica desabilitado sem tipo de dia escolhido", () => {
    const src = readOverride();
    expect(src).toMatch(/disabled=\{[^}]*selectedDayType === null/);
  });
});

describe("PastOverridesSheet: lista de passadas e apagar (Item 4.4)", () => {
  it("lê do banco, permite apagar deslizando com undo e tem estado vazio", () => {
    const src = readPast();
    expect(src).toMatch(/listOverrides\(/);
    expect(src).toMatch(/deleteOverride\(/);
    expect(src).toMatch(/override\.deleted/);
    expect(src).toMatch(/override\.past\.empty/);
  });
});

describe("SettingsSheet: ligações de exceções (Item 4)", () => {
  it("deslizar para apagar chama deleteOverride com undo e abre pastOverrides", () => {
    const src = readFileSync(join(__dirname, "SettingsSheet.tsx"), "utf8");
    expect(src).toMatch(/deleteOverride\(/);
    expect(src).toMatch(/override\.deleted/);
    expect(src).toMatch(/toast\.action\.undo/);
    expect(src).toMatch(/settings\.override\.past/);
    expect(src).toMatch(/kind:\s*"pastOverrides"/);
  });
});

