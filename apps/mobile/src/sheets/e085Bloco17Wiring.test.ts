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
  it("4a: a folha chama useHomePhrase( e monta com phraseMounted, com medidor fora do contêiner animado", () => {
    expect(homeSheet).toMatch(/useHomePhrase\(/);
    expect(homeSheet).toMatch(
      /showPhrase\s*=\s*phraseVisible\(\{\s*phrase,\s*inTrip:\s*Boolean\(tripCard\),\s*detent:\s*state\.detent,?\s*\}\)/,
    );
    expect(homeSheet).toMatch(
      /isPhraseMounted\s*=\s*phraseMounted\(\{\s*phrase,\s*inTrip:\s*Boolean\(tripCard\),?\s*\}\)/,
    );
    expect(homeSheet).toMatch(
      /isPhraseMounted\s*&&\s*phrase\s*\?\s*\(\s*<>\s*<View\b[^>]*?pointerEvents="none"[^>]*?onLayout=\{[^\n}]*?setPhraseHeight/,
    );
  });

  it("Item 2 guarda estático (FN-15): onLayout está no View com position absolute e pointerEvents none, fora do Animated.View", () => {
    // onLayout com setPhraseHeight está no View com pointerEvents="none" e estilo phraseMeasure (position absolute)
    expect(homeSheet).toMatch(
      /<View\b[^>]*?pointerEvents="none"[^>]*?style=\{styles\.phraseMeasure\}[^>]*?onLayout=\{[^\n}]*?setPhraseHeight/,
    );
    expect(homeSheet).toMatch(/phraseMeasure:\s*\{\s*position:\s*"absolute"/);

    // O filho do Animated.View animado NÃO tem onLayout
    const animatedPhrase = homeSheet.match(/<Animated\.View\b[\s\S]*?<\/Animated\.View>/);
    expect(animatedPhrase?.[0]).toBeDefined();
    expect(animatedPhrase![0]).not.toContain("setPhraseHeight");

    // O Animated.View da frase não recebe showPhrase nem state.detent em style ou montagem
    expect(homeSheet).not.toMatch(/showPhrase\s*&&\s*phrase\s*\?\s*\(\s*<Animated\.View/);
    expect(homeSheet).not.toMatch(/<Animated\.View\b[^>]*?style=\{[^}]*?showPhrase/);
    expect(homeSheet).not.toMatch(/<Animated\.View\b[^>]*?style=\{[^}]*?state\.detent/);

    // O efeito que zera phraseHeight depende de isPhraseMounted
    expect(homeSheet).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*if\s*\(!isPhraseMounted\)\s*\{\s*setPhraseHeight\(0\);\s*\}\s*\},\s*\[isPhraseMounted\]\)/);
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
