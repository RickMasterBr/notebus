import { describe, expect, it } from "vitest";
import {
  applyDelta,
  applyPickedTime,
  type RecordDraft,
  timeLabelWithDay,
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

describe("recordDraft.timeLabelWithDay (Item 3)", () => {
  it("00:10 escolher 23:50 → 'ontem às 23:50'", () => {
    // Domingo 11/10 às 00:10
    const now = lisbonMs("2026-10-11", "00:10");
    const initialDraft = makeDraft(now);

    // No seletor nativo, escolhe 23:50 (cai em sábado 10/10 às 23:50)
    const pickedDraft = applyPickedTime(initialDraft, 23, 50, now);

    const result = timeLabelWithDay(pickedDraft, now);
    expect(result).toEqual({
      text: "ontem às 23:50",
      yesterday: true,
    });
  });

  it("14:00 escolher 13:00 → '13:00' (sem ontem)", () => {
    // Quinta 08/10 às 14:00
    const now = lisbonMs("2026-10-08", "14:00");
    const initialDraft = makeDraft(now);

    // No seletor nativo, escolhe 13:00 (mesmo dia)
    const pickedDraft = applyPickedTime(initialDraft, 13, 0, now);

    const result = timeLabelWithDay(pickedDraft, now);
    expect(result).toEqual({
      text: "13:00",
      yesterday: false,
    });
  });

  it("−10 às 00:05 → 'ontem às 23:55'", () => {
    // Domingo 11/10 às 00:05
    const now = lisbonMs("2026-10-11", "00:05");
    const initialDraft = makeDraft(now);

    // Toca no chip −10 (00:05 − 10 min = 23:55 de sábado 10/10)
    const adjustedDraft = applyDelta(initialDraft, -10, now);

    const result = timeLabelWithDay(adjustedDraft, now);
    expect(result).toEqual({
      text: "ontem às 23:55",
      yesterday: true,
    });
  });
});
