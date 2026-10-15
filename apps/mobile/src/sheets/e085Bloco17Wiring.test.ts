/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 17 (Início com frase viva):
 * Item 4: O hook e a ligação na HomeSheet.
 */
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

const homeSheet = squash(read("sheets/HomeSheet.tsx"));
const homePhraseSource = squash(read("ui/HomePhrase.tsx"));

describe("e085Bloco17Wiring (Item 4: O hook e a ligação na HomeSheet)", () => {
  it("4a: a folha chama useHomePhrase( e a frase só monta com phraseVisible({ ... detent: state.detent })", () => {
    expect(homeSheet).toMatch(/useHomePhrase\(/);
    expect(homeSheet).toMatch(
      /showPhrase\s*=\s*phraseVisible\(\{\s*phrase,\s*inTrip:\s*Boolean\(tripCard\),\s*detent:\s*state\.detent,?\s*\}\)/,
    );
    expect(homeSheet).toMatch(
      /showPhrase\s*&&\s*phrase\s*\?\s*\(\s*<Animated\.View\b[\s\S]*?phraseClipStyle[\s\S]*?>\s*<View\b[^>]*?onLayout=\{[^\n}]*?setPhraseHeight/,
    );
  });

  it("4b: o bloco da frase fica antes de <SearchPill e depois de cards.showAny", () => {
    const cardIdx = homeSheet.indexOf("cards.showAny");
    const phraseIdx = homeSheet.indexOf("<HomePhrase");
    const pillIdx = homeSheet.indexOf("<SearchPill");
    expect(cardIdx).toBeGreaterThan(-1);
    expect(phraseIdx).toBeGreaterThan(cardIdx);
    expect(pillIdx).toBeGreaterThan(phraseIdx);
  });

  it("4c: a scrollAreaHeight subtrai phraseHeight", () => {
    expect(homeSheet).toMatch(
      /scrollAreaHeight\s*=\s*Math\.max\([\s\S]*?-\s*phraseHeight\s*-\s*space\.md/,
    );
  });

  it("4d: small não contém phraseHeight", () => {
    const smallMatch = homeSheet.match(/const\s+small\s*=\s*[^;]+;/);
    expect(smallMatch?.[0]).toBeDefined();
    expect(smallMatch![0]).not.toMatch(/phraseHeight/);
  });

  it("4e: phraseVisible recebe inTrip: Boolean(tripCard)", () => {
    expect(homeSheet).toMatch(
      /phraseVisible\(\{[^}]*?inTrip:\s*Boolean\(tripCard\)/,
    );
  });

  it("4f: o container da frase tem accessibilityRole=\"header\" e o accessibilityLabel vem de t(\"home.greeting.a11y\"", () => {
    expect(homePhraseSource).toMatch(/accessibilityRole="header"/);
    expect(homePhraseSource).toMatch(
      /accessibilityLabel=\{t\("home\.greeting\.a11y",\s*\{\s*eyebrow:\s*phrase\.eyebrow,\s*headline:\s*phrase\.headline,?\s*\}\)\}/,
    );
  });

  it("4g: a linha 'chegando' só monta com phrase.arriving (phrase.arriving ?)", () => {
    expect(homePhraseSource).toMatch(
      /phrase\.arriving\s*\?\s*\(\s*<View\b[^>]*?style=\{styles\.arrivingRow\}/,
    );
  });
});
