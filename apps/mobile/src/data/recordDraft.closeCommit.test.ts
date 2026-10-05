import { describe, expect, it } from "vitest";
import { applyDelta, closeCommit, initDraft } from "./recordDraft";
import type { ObservationRow } from "./registro";

function makeRow(): ObservationRow {
  const t0813 = new Date("2026-10-01T07:13:20.000Z").getTime();
  return {
    id: "obs-1",
    stopId: "stop-1",
    lineId: "line-1",
    observedAt: t0813,
    observedEndAt: null,
    kind: "boarded",
    mode: "live",
    recordedAt: t0813,
    note: null,
    deletedAt: null,
    serviceDate: "2026-10-01",
    serviceMinute: 493,
    patternStopId: "ps-1",
    tripId: "trip-1",
    matchStatus: "auto",
    deviationMin: 1,
    rideId: null,
    matchRuleVersion: 1,
    reviewDismissedAt: null,
    source: "user",
    gpsLat: null,
    gpsLon: null,
    gpsAccuracyM: null,
    createdAt: t0813,
    updatedAt: t0813,
  };
}

describe("closeCommit", () => {
  it("(a) sem mudança no rascunho: null", () => {
    const row = makeRow();
    const draft = initDraft(row);
    expect(closeCommit(draft, row, false)).toBeNull();
  });

  it("(b) com −5: patch com observedAt", () => {
    const row = makeRow();
    const draft = initDraft(row);
    const modified = applyDelta(draft, -5, row.observedAt);
    const patch = closeCommit(modified, row, false);
    expect(patch).not.toBeNull();
    expect(patch?.observedAt).toBe(row.observedAt - 5 * 60_000);
  });

  it("(c) deleted = true com rascunho alterado: null", () => {
    const row = makeRow();
    const draft = initDraft(row);
    const modified = applyDelta(draft, -5, row.observedAt);
    expect(closeCommit(modified, row, true)).toBeNull();
  });

  it("(d) rascunho que voltou ao valor original: null", () => {
    const row = makeRow();
    const draft = initDraft(row);
    const modified = applyDelta(draft, -5, row.observedAt);
    const restored = applyDelta(modified, 1, row.observedAt);
    const backToOriginal = applyDelta(restored, 1, row.observedAt);
    // aplica +1, +1, +1, +1, +1 para voltar ao valor inicial
    const step3 = applyDelta(backToOriginal, 1, row.observedAt);
    const step4 = applyDelta(step3, 1, row.observedAt);
    const finalDraft = applyDelta(step4, 1, row.observedAt);
    expect(finalDraft.centerMs).toBe(draft.centerMs);
    expect(closeCommit(finalDraft, row, false)).toBeNull();
  });
});
