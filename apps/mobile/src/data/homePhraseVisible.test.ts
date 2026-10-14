import { describe, expect, it } from "vitest";
import type { HomePhrase } from "./homePhrase";
import { phraseVisible } from "./homePhraseVisible";

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
});
