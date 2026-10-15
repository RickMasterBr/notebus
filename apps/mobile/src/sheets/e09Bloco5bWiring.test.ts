/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-09 Bloco 5b guardas de ligação (e09Bloco5bWiring)", () => {
  describe("Item 0.1 · avisos: o resultado de toggleAlarms volta ao interruptor", () => {
    const settings = squash(read("sheets/SettingsSheet.tsx"));

    it("handleToggleAlarms devolve o resultado de toggleAlarms", () => {
      expect(settings).toMatch(/const handleToggleAlarms = \(val: boolean\) => \{ return toggleAlarms\(\{ next: val,/);
    });

    it("o <Switch> de avisos consome valor e onValueChange do interruptor otimista", () => {
      expect(settings).toMatch(
        /<Switch accessibilityLabel=\{t\("settings\.alarms\.allow"\)\} value=\{alarmsSwitch\.value\} onValueChange=\{alarmsSwitch\.onValueChange\}/,
      );
    });
  });
});
