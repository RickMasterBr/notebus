import { describe, expect, it } from "vitest";
import { homePendingInfo } from "./homePending";
import type { ObservationRow } from "./registro";

function makeRow(partial: Partial<ObservationRow> & { id: string; observedAt: number }): ObservationRow {
  return {
    id: partial.id,
    stopId: partial.stopId ?? "stop-1",
    lineId: partial.lineId ?? "line-1",
    observedAt: partial.observedAt,
    observedEndAt: partial.observedEndAt ?? null,
    kind: partial.kind ?? "boarded",
    mode: partial.mode ?? "live",
    recordedAt: partial.observedAt,
    note: null,
    deletedAt: partial.deletedAt ?? null,
    serviceDate: "2026-10-01",
    serviceMinute: 500,
    patternStopId: "ps-1",
    tripId: "trip-1",
    matchStatus: partial.matchStatus ?? "auto",
    deviationMin: 0,
    rideId: null,
    matchRuleVersion: 1,
    reviewDismissedAt: partial.reviewDismissedAt ?? null,
    source: "user",
    gpsLat: null,
    gpsLon: null,
    gpsAccuracyM: null,
    createdAt: partial.observedAt,
    updatedAt: partial.observedAt,
  };
}

describe("homePendingInfo", () => {
  it("devolve null quando não há registros ou nenhum precisa de revisão", () => {
    expect(homePendingInfo([])).toBeNull();

    const autoRow = makeRow({ id: "1", observedAt: 1000, matchStatus: "auto" });
    expect(homePendingInfo([autoRow])).toBeNull();

    const deletedOrphan = makeRow({ id: "2", observedAt: 1000, matchStatus: "orphan", deletedAt: 2000 });
    expect(homePendingInfo([deletedOrphan])).toBeNull();

    const dismissedOrphan = makeRow({ id: "3", observedAt: 1000, matchStatus: "orphan", reviewDismissedAt: 2000 });
    expect(homePendingInfo([dismissedOrphan])).toBeNull();

    const alightedOrphan = makeRow({ id: "4", observedAt: 1000, matchStatus: "orphan", kind: "alighted" });
    expect(homePendingInfo([alightedOrphan])).toBeNull();
  });

  it("com 1 registro órfão: count 1, id dele e texto '1 registro para conferir'", () => {
    const orphan = makeRow({ id: "obs-1", observedAt: 5000, matchStatus: "orphan" });
    const info = homePendingInfo([orphan]);
    expect(info).not.toBeNull();
    expect(info?.count).toBe(1);
    expect(info?.targetObservationId).toBe("obs-1");
    expect(info?.text).toBe("1 registro para conferir");
  });

  it("com N registros: count N, id do mais recente e texto 'N registros para conferir'", () => {
    const older = makeRow({ id: "obs-older", observedAt: 1000, matchStatus: "orphan" });
    const newest = makeRow({ id: "obs-newest", observedAt: 3000, matchStatus: "ambiguous" });
    const middle = makeRow({ id: "obs-middle", observedAt: 2000, matchStatus: "orphan" });

    const info = homePendingInfo([older, newest, middle]);
    expect(info).not.toBeNull();
    expect(info?.count).toBe(3);
    expect(info?.targetObservationId).toBe("obs-newest");
    expect(info?.text).toBe("3 registros para conferir");
  });
});
