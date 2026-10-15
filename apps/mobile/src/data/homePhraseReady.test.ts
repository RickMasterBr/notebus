import { describe, expect, it } from "vitest";
import { homePhraseReady } from "./homePhraseReady";

describe("homePhraseReady (Item 3b)", () => {
  const base = {
    nameLoaded: true,
    placesReady: true,
    registroReady: true,
    scheduleReady: true,
    asyncDone: true,
  };

  it("tudo verdadeiro -> true", () => {
    expect(homePhraseReady(base)).toBe(true);
  });

  it("nameLoaded falso -> false", () => {
    expect(homePhraseReady({ ...base, nameLoaded: false })).toBe(false);
  });

  it("placesReady falso -> false", () => {
    expect(homePhraseReady({ ...base, placesReady: false })).toBe(false);
  });

  it("registroReady falso -> false", () => {
    expect(homePhraseReady({ ...base, registroReady: false })).toBe(false);
  });

  it("scheduleReady falso -> false", () => {
    expect(homePhraseReady({ ...base, scheduleReady: false })).toBe(false);
  });

  it("asyncDone falso -> false", () => {
    expect(homePhraseReady({ ...base, asyncDone: false })).toBe(false);
  });
});
