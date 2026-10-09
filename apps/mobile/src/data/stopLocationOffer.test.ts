/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { STOP_LOCATION_DISMISSED_KEY, locationOffer, readDismissed, toStopLocationRecords, writeDismissed } from "./stopLocationOffer";

const gps = (n: number) => ({ gpsLat: 39.7441 + n * 0.00001, gpsLon: -8.8072, gpsAccuracyM: 10 });
const obs = (id: string, recordedAt: number, over: Record<string, unknown> = {}) => ({
  id,
  stopId: "s1",
  mode: "live" as const,
  recordedAt,
  ...gps(0),
  ...over,
});
const three = [obs("a", 1000), obs("b", 2000), obs("c", 3000)];

describe("toStopLocationRecords", () => {
  it("filtra o ponto, usa recordedAt como atMs e registro sem gps_* vira gps null", () => {
    const rows = toStopLocationRecords(
      [obs("a", 1000), obs("b", 2000, { gpsLat: null, gpsLon: null, gpsAccuracyM: null }), obs("z", 3000, { stopId: "outro" })],
      "s1",
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0]!.gps).toEqual({ lat: 39.7441, lon: -8.8072, accuracyM: 10, atMs: 1000 });
    expect(rows[1]!.gps).toBeNull();
  });
});

describe("locationOffer", () => {
  const offer = (rows: ReturnType<typeof obs>[], has = false, dismissed = {}) => locationOffer(toStopLocationRecords(rows, "s1"), "s1", has, dismissed);

  it("aparece com 3 registros ao vivo concordantes", () => {
    const found = offer(three);
    expect(found?.count).toBe(3);
    expect(found?.recordIds[0]).toBe("c");
    expect(found?.accuracyM).toBe(10);
  });
  it("não aparece com 2 registros", () => {
    expect(offer(three.slice(0, 2))).toBeNull();
  });
  it("não aparece se um dos três é later", () => {
    expect(offer([three[0]!, three[1]!, obs("c", 3000, { mode: "later" })])).toBeNull();
  });
  it("não aparece se o ponto já tem localização", () => {
    expect(offer(three, true)).toBeNull();
  });
  it("Agora não some e volta com registro posterior", () => {
    const dismissed = { s1: "c" };
    expect(offer(three, false, dismissed)).toBeNull();
    expect(offer([...three, obs("d", 4000)], false, dismissed)?.recordIds[0]).toBe("d");
  });
});

describe("dispensa guardada em setting", () => {
  it("lê o que gravou, sobrescreve e a chave não vai no backup", async () => {
    const { db } = testDbWithSqlite();
    expect(await readDismissed(db)).toEqual({});
    await writeDismissed(db, { s1: "c" }, 1000);
    expect(await readDismissed(db)).toEqual({ s1: "c" });
    await writeDismissed(db, { s1: "d", s2: "x" }, 2000);
    expect(await readDismissed(db)).toEqual({ s1: "d", s2: "x" });
    const { BACKUP_SETTING_KEYS } = await import("@notebus/domain");
    expect(BACKUP_SETTING_KEYS).not.toContain(STOP_LOCATION_DISMISSED_KEY);
  });
});
