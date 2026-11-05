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
  squash(stripComments(readFileSync(join(__dirname, rel), "utf8").replace(/\r\n/g, "\n")));

describe("homePhraseLayout (ideia 229: a hora da frase Hora de sair aparece inteira)", () => {
  const src = readSource("HomePhrase.tsx");

  it("a: a linha chegando aceita duas linhas e nenhum texto do bloco fica em uma", () => {
    expect(src.match(/numberOfLines=\{2\}/g)).toHaveLength(2);
    expect(src).not.toMatch(/numberOfLines=\{1\}/);
  });

  it("b: o texto da linha chegando encolhe ao lado do LineBadge (flexShrink 1)", () => {
    expect(src).toMatch(/arrivingText:\s*\{\s*flexShrink:\s*1\s*\}/);
    expect(src).toMatch(
      /<Text numberOfLines=\{2\} style=\{\[type\.eyebrow, styles\.arrivingText, \{ color: colors\.textSecondary \}\]\}/,
    );
  });

  it("c: o LineBadge fica na fileira chegando, fora do Text", () => {
    const row = src.match(/<View style=\{styles\.arrivingRow\}>(.*?)<\/View>/);
    expect(row).not.toBeNull();
    const rowSrc = row?.[1] ?? "";
    expect(rowSrc).toMatch(/<LineBadge\b/);
    expect(rowSrc).toMatch(/<Text\b/);
    expect(rowSrc.indexOf("<LineBadge")).toBeLessThan(rowSrc.indexOf("<Text"));
    expect(src).not.toMatch(/<Text\b[^>]*>\s*<LineBadge\b/);
  });

  it("d: o texto continua no estilo type.eyebrow, sem type.subtitle", () => {
    expect(src).toMatch(/type\.eyebrow/);
    expect(src).not.toMatch(/type\.subtitle/);
  });
});
