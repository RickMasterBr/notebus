import { describe, expect, it } from "vitest";
import { lisbonWallClock } from "@notebus/domain";
import { pickerValue } from "./recordDraft";

describe("pickerValue", () => {
  it("para três instantes (inverno, verão e perto da meia-noite), getHours() e getMinutes() batem com lisbonWallClock(ms).minute", () => {
    // 1. Inverno (UTC+0 em Lisboa): 15 de janeiro de 2026 às 14:35 UTC = 14:35 em Lisboa
    const winterMs = new Date("2026-01-15T14:35:00.000Z").getTime();
    const winterDate = pickerValue(winterMs);
    const winterWall = lisbonWallClock(winterMs);
    expect(winterDate.getHours()).toBe(Math.floor(winterWall.minute / 60));
    expect(winterDate.getMinutes()).toBe(winterWall.minute % 60);

    // 2. Verão (UTC+1 em Lisboa): 15 de julho de 2026 às 14:35 UTC = 15:35 em Lisboa
    const summerMs = new Date("2026-07-15T14:35:00.000Z").getTime();
    const summerDate = pickerValue(summerMs);
    const summerWall = lisbonWallClock(summerMs);
    expect(summerDate.getHours()).toBe(Math.floor(summerWall.minute / 60));
    expect(summerDate.getMinutes()).toBe(summerWall.minute % 60);

    // 3. Perto da meia-noite de Lisboa: 1 de outubro de 2026 às 22:58 UTC = 23:58 em Lisboa (UTC+1)
    const midnightMs = new Date("2026-10-01T22:58:00.000Z").getTime();
    const midnightDate = pickerValue(midnightMs);
    const midnightWall = lisbonWallClock(midnightMs);
    expect(midnightDate.getHours()).toBe(Math.floor(midnightWall.minute / 60));
    expect(midnightDate.getMinutes()).toBe(midnightWall.minute % 60);
  });
});
