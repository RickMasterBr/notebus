import { describe, expect, it } from "vitest";
import { markFirstRunDone, needsFirstRun } from "./appState";
import * as schema from "./schema";
import { testDb } from "./testing/drizzleTestDb";

describe("primeiro uso", () => {
  it("banco novo pede a TL-13; marcado ou com dataset, não", async () => {
    const db = testDb();
    expect(await needsFirstRun(db)).toBe(true);
    await markFirstRunDone(db, 10);
    await markFirstRunDone(db, 20); // repetir não duplica
    expect(await needsFirstRun(db)).toBe(false);
    expect(await db.select().from(schema.setting)).toHaveLength(1);

    const outro = testDb();
    await outro.insert(schema.dataset).values({
      id: "d1", createdAt: 1, updatedAt: 1, source: "official", networkId: "n", name: "MOBILIS", version: "2026-09-01", importedAt: 1, checksum: "x",
    });
    expect(await needsFirstRun(outro)).toBe(false);
  });

  it("orientação do modo foco: começa falso, marcado vira verdadeiro e não duplica", async () => {
    const { hasShownAlarmFocusHint, markAlarmFocusHintShown } = await import("./appState");
    const db = testDb();
    expect(await hasShownAlarmFocusHint(db)).toBe(false);
    await markAlarmFocusHintShown(db, 10);
    await markAlarmFocusHintShown(db, 20); // idempotente
    expect(await hasShownAlarmFocusHint(db)).toBe(true);
  });
});
