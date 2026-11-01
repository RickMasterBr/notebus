import { describe, expect, it } from "vitest";
import type { TripData } from "@notebus/domain";
import { alarmOfCard } from "./alarmsUi";

describe("alarmOfCard com a data de serviço (ideia 163)", () => {
  const trip: TripData = {
    id: "trip-1",
    patternId: "patt-1",
    firstPosition: 1,
    lastPosition: 5,
    stopTimes: [{ position: 1, serviceMinute: 480, origin: "official" }],
  };
  const card = { optionId: "opt-1", tripId: "trip-1" };
  const onlyOn = (day: string) => ({
    id: `alarm-${day}`,
    optionId: "opt-1",
    anchorTripId: "trip-1",
    anchorBaseMinute: 480,
    enabled: true,
    weekdays: [] as number[],
    onceDate: day,
    validFrom: day,
    validTo: null,
  });

  it("aviso só de outro dia não casa; o de hoje casa", () => {
    const alarms = [onlyOn("2026-10-09"), onlyOn("2026-10-08")];
    expect(alarmOfCard(card, [alarms[0]!], trip, 1, "2026-10-08")).toBeUndefined();
    expect(alarmOfCard(card, alarms, trip, 1, "2026-10-08")?.id).toBe("alarm-2026-10-08");
  });

  it("sem a data, o comportamento antigo continua", () => {
    expect(alarmOfCard(card, [onlyOn("2026-10-09")], trip, 1)?.id).toBe("alarm-2026-10-09");
  });
});
