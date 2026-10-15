/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const readSource = (rel: string) =>
  stripComments(readFileSync(join(__dirname, rel), "utf8").replace(/\r\n/g, "\n"));

describe("e085Fechamento3Wiring (Item 3: Frase viva, pronto testável e tokens)", () => {
  it("3i: useHomePhrase chama homePhraseReady com os cinco campos, nameLoaded incluído", () => {
    const src = squash(readSource("useHomePhrase.ts"));
    expect(src).toMatch(/homePhraseReady\(\{/);
    expect(src).toMatch(/nameLoaded:\s*userName\.loaded/);
    expect(src).toMatch(/placesReady:\s*places\.status\s*===\s*"ready"/);
    expect(src).toMatch(/registroReady:\s*registro\.status\s*===\s*"ready"/);
    expect(src).toMatch(/scheduleReady:\s*schedule\.status\s*===\s*"ready"/);
    expect(src).toMatch(/asyncDone:\s*asyncRead\.done/);
  });

  it("3ii: o efeito de congelar só roda com ready e não repete (frozenRef)", () => {
    const src = squash(readSource("useHomePhrase.ts"));
    expect(src).toMatch(/if\s*\(!ready\s*\|\|\s*frozenRef\.current\)\s*return;/);
    expect(src).toMatch(/frozenRef\.current\s*=\s*true;/);
  });

  it("3iii: UserNameProvider chama loadUserNameState com setLoaded(true) e contexto inclui loaded", () => {
    const src = squash(readSource("UserNameProvider.tsx"));
    expect(src).toMatch(
      /loadUserNameState\(\s*db,\s*setNameState,\s*\(\)\s*=>\s*setLoaded\(true\)\s*\)/,
    );
    expect(src).toMatch(/const\s+value\s*=\s*useMemo\([\s\S]*?loaded,/);
  });

  it("3iv: HomePhrase usa type.eyebrow na linha chegando, sem type.subtitle nem literal de estilo", () => {
    const src = readSource("../ui/HomePhrase.tsx");
    expect(src).toMatch(/type\.eyebrow/);
    expect(src).not.toMatch(/type\.subtitle/);
    expect(src).not.toMatch(/fontSize:\s*14/);
    expect(src).not.toMatch(/gap:\s*6/);
    expect(src).not.toMatch(/marginTop:\s*2/);
  });
});
