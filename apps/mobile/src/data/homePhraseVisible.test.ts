import { describe, expect, it } from "vitest";
import type { HomePhrase } from "./homePhrase";
import { nextPhraseHeight, phraseMounted, phraseVisible } from "./homePhraseVisible";

describe("phraseVisible (Item 4.3, D-141, D-207)", () => {
  const samplePhrase: HomePhrase = {
    id: "invite_where",
    eyebrow: "Boa tarde, Richard",
    headline: "Para onde vamos hoje?",
    arriving: null,
  };

  it("detent pequeno (0) -> false (não aparece no detent pequeno, D-141)", () => {
    expect(
      phraseVisible({
        phrase: samplePhrase,
        inTrip: false,
        detent: 0,
      }),
    ).toBe(false);
  });

  it("detent médio (1) e grande (2) -> true", () => {
    expect(
      phraseVisible({
        phrase: samplePhrase,
        inTrip: false,
        detent: 1,
      }),
    ).toBe(true);

    expect(
      phraseVisible({
        phrase: samplePhrase,
        inTrip: false,
        detent: 2,
      }),
    ).toBe(true);
  });

  it("em viagem (inTrip === true) -> false (mesmo nos detents 1 e 2)", () => {
    expect(
      phraseVisible({
        phrase: samplePhrase,
        inTrip: true,
        detent: 1,
      }),
    ).toBe(false);

    expect(
      phraseVisible({
        phrase: samplePhrase,
        inTrip: true,
        detent: 2,
      }),
    ).toBe(false);
  });

  it("phrase nula (phrase === null) -> false", () => {
    expect(
      phraseVisible({
        phrase: null,
        inTrip: false,
        detent: 1,
      }),
    ).toBe(false);

    expect(
      phraseVisible({
        phrase: null,
        inTrip: false,
        detent: 2,
      }),
    ).toBe(false);
  });

  describe("phraseMounted (E-09 bloco 15, FN-15)", () => {
    it("monta quando há frase e não há viagem, sem depender de detent", () => {
      expect(phraseMounted({ phrase: samplePhrase, inTrip: false })).toBe(true);
    });

    it("não monta em viagem", () => {
      expect(phraseMounted({ phrase: samplePhrase, inTrip: true })).toBe(false);
    });

    it("não monta sem frase", () => {
      expect(phraseMounted({ phrase: null, inTrip: false })).toBe(false);
    });
  });

  describe("nextPhraseHeight (E-09 bloco 15, FN-15)", () => {
    it("ignora variação menor que 0,5 px (corta laço de medida)", () => {
      expect(nextPhraseHeight(64, 64.2)).toBe(64);
      expect(nextPhraseHeight(64, 64.49)).toBe(64);
      expect(nextPhraseHeight(64, 63.6)).toBe(64);
    });

    it("aceita variação maior ou igual a 0,5 px", () => {
      expect(nextPhraseHeight(64, 64.5)).toBe(64.5);
      expect(nextPhraseHeight(64, 63.5)).toBe(63.5);
      expect(nextPhraseHeight(0, 64)).toBe(64);
      expect(nextPhraseHeight(64, 0)).toBe(0);
    });
  });
});
