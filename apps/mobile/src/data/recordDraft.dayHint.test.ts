import { describe, expect, it } from "vitest";
import {
  applyDelta,
  applyPickedTime,
  dayHint,
  type RecordDraft,
} from "./recordDraft";

const lisbonMs = (date: string, hhmm: string, ss = "00") =>
  Date.parse(`${date}T${hhmm}:${ss}Z`) - 3_600_000;

function makeDraft(centerMs: number): RecordDraft {
  return {
    centerMs,
    precision: "exact",
    spreadMinutes: 5,
    kind: "boarded",
    memory: false,
    note: "",
  };
}

describe("recordDraft.dayHint (Q-94 = A)", () => {
  it("às 00:10 escolher 23:50 → 'yesterday'", () => {
    // Domingo 11/10 às 00:10
    const now = lisbonMs("2026-10-11", "00:10");
    const initialDraft = makeDraft(now);

    // No seletor nativo, escolhe 23:50 (cai em sábado 10/10 às 23:50 conforme Q-44)
    const pickedDraft = applyPickedTime(initialDraft, 23, 50, now);

    expect(dayHint(pickedDraft, now)).toBe("yesterday");
  });

  it("às 14:00 escolher 13:00 → 'today'", () => {
    // Quinta 08/10 às 14:00
    const now = lisbonMs("2026-10-08", "14:00");
    const initialDraft = makeDraft(now);

    // No seletor nativo, escolhe 13:00 (mesmo dia)
    const pickedDraft = applyPickedTime(initialDraft, 13, 0, now);

    expect(dayHint(pickedDraft, now)).toBe("today");
  });

  it("−10 às 00:05 → 'yesterday'", () => {
    // Domingo 11/10 às 00:05
    const now = lisbonMs("2026-10-11", "00:05");
    const initialDraft = makeDraft(now);

    // Toca no chip −10 (00:05 − 10 min = 23:55 de sábado 10/10)
    const adjustedDraft = applyDelta(initialDraft, -10, now);

    expect(dayHint(adjustedDraft, now)).toBe("yesterday");
  });

  it("às 00:05 sem ajuste ou com −1/mais tarde → 'today'", () => {
    const now = lisbonMs("2026-10-11", "00:05");
    const initialDraft = makeDraft(now);

    expect(dayHint(initialDraft, now)).toBe("today");

    // −2 ainda cai no mesmo dia (00:03)
    const minus2 = applyDelta(initialDraft, -2, now);
    expect(dayHint(minus2, now)).toBe("today");
  });
});
