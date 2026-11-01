import { describe, expect, it } from "vitest";
import { homePhraseEpochKey } from "./homePhraseEpoch";

const base = { activeCount: 0, tripId: null, userName: "Ana" };

describe("homePhraseEpochKey", () => {
  it("é igual com as mesmas entradas", () => {
    expect(homePhraseEpochKey({ ...base })).toBe(homePhraseEpochKey({ ...base }));
  });

  it("muda ao voltar ao app", () => {
    expect(homePhraseEpochKey({ ...base, activeCount: 1 })).not.toBe(homePhraseEpochKey(base));
  });

  it("muda ao começar a viagem", () => {
    expect(homePhraseEpochKey({ ...base, tripId: "b1" })).not.toBe(homePhraseEpochKey(base));
  });

  it("muda ao terminar a viagem", () => {
    const inTrip = { ...base, tripId: "b1" };
    expect(homePhraseEpochKey({ ...inTrip, tripId: null })).not.toBe(homePhraseEpochKey(inTrip));
  });

  it("muda ao trocar de viagem", () => {
    const a = { ...base, tripId: "b1" };
    expect(homePhraseEpochKey({ ...a, tripId: "b2" })).not.toBe(homePhraseEpochKey(a));
  });

  it("muda ao mudar o nome", () => {
    expect(homePhraseEpochKey({ ...base, userName: "Rui" })).not.toBe(homePhraseEpochKey(base));
    expect(homePhraseEpochKey({ ...base, userName: null })).not.toBe(homePhraseEpochKey(base));
  });
});
