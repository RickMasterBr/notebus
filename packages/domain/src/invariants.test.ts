import { describe, expect, it } from "vitest";
import {
  checkBusOption,
  checkObservationInterval,
  checkPatternPositions,
  checkTripTimes,
} from "./invariants";

describe("invariante 1: posições 1…n sem buracos", () => {
  it("aceita 1…n em qualquer ordem", () => {
    expect(checkPatternPositions([3, 1, 2])).toBeNull();
    expect(checkPatternPositions([])).toBeNull();
  });
  it("recusa buraco, repetição e começo fora do 1", () => {
    expect(checkPatternPositions([1, 2, 4])).not.toBeNull();
    expect(checkPatternPositions([1, 2, 2, 3])).not.toBeNull();
    expect(checkPatternPositions([2, 3])).not.toBeNull();
  });
});

describe("invariante 2: horários não diminuem na viagem", () => {
  it("aceita horários iguais ou crescentes, inclusive depois de 24:00", () => {
    expect(
      checkTripTimes([
        { position: 1, serviceMinute: 1430 },
        { position: 2, serviceMinute: 1430 },
        { position: 5, serviceMinute: 1445 },
      ]),
    ).toBeNull();
  });
  it("recusa horário que volta", () => {
    expect(
      checkTripTimes([
        { position: 2, serviceMinute: 402 },
        { position: 1, serviceMinute: 400 },
        { position: 3, serviceMinute: 401 },
      ]),
    ).not.toBeNull();
  });
});

describe("invariante 3: descida depois do embarque", () => {
  it("aceita descida posterior no mesmo percurso", () => {
    expect(checkBusOption({ patternId: "p", position: 2 }, { patternId: "p", position: 17 })).toBeNull();
  });
  it("recusa descida anterior, igual ou em outro percurso", () => {
    expect(checkBusOption({ patternId: "p", position: 17 }, { patternId: "p", position: 2 })).not.toBeNull();
    expect(checkBusOption({ patternId: "p", position: 2 }, { patternId: "p", position: 2 })).not.toBeNull();
    expect(checkBusOption({ patternId: "p", position: 2 }, { patternId: "q", position: 5 })).not.toBeNull();
  });
});

describe("invariante 4: intervalo da observação", () => {
  const t = Date.UTC(2026, 9, 2, 6, 5);
  it("aceita hora exata e intervalo de até 30 min", () => {
    expect(checkObservationInterval(t, null)).toBeNull();
    expect(checkObservationInterval(t, t + 30 * 60_000)).toBeNull();
  });
  it("recusa fim antes do início e intervalo maior que 30 min", () => {
    expect(checkObservationInterval(t, t - 1)).not.toBeNull();
    expect(checkObservationInterval(t, t + 30 * 60_000 + 1)).not.toBeNull();
  });
});
