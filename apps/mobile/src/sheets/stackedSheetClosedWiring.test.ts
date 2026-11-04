/** Guarda de ligação: a pilha segue a tela quando a biblioteca fecha a folha sem `onClose` (ideia 206, D-390). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) =>
  readFileSync(new URL(f, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

const sheet = read("./StackedSheet.tsx");
const hook = read("./useClosedWithoutNotice.ts");

describe("StackedSheet segue a tela", () => {
  it("importa e chama o hook com animatedIndex, pop e resetKey: revealKey", () => {
    expect(sheet.includes('import { useClosedWithoutNotice } from "./useClosedWithoutNotice";')).toBe(true);
    expect(sheet.includes("useClosedWithoutNotice({ animatedIndex, pop, resetKey: revealKey });")).toBe(true);
  });
  it("StackedSheet.tsx continua com exatamente 2 .value", () => {
    expect(sheet.match(/\.value\b/g)?.length).toBe(2);
  });
  it("o hook usa useAnimatedReaction e lê animatedIndex.value só no reaction e no setTimeout", () => {
    expect(hook.includes("useAnimatedReaction(")).toBe(true);
    expect(hook.match(/animatedIndex\.value/g)?.length).toBe(2);
    expect(/useAnimatedReaction\( \(\) => animatedIndex\.value,/.test(hook)).toBe(true);
    expect(/setTimeout\(\(\) => \{.*animatedIndex\.value.*\}, CONFIRM_MS\)/.test(hook)).toBe(true);
  });
  it("o hook depende de resetKey", () => {
    expect(/\}, \[resetKey, cancel\]\)/.test(hook)).toBe(true);
    expect(hook.includes("hasOpened.current = false;")).toBe(true);
  });
});
