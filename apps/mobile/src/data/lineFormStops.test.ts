/// <reference types="node" />
import { officialId } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { importMobilis, type ImportDb } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { lineSeed } from "../db/testing/lineSeed";
import { t } from "../i18n";
import { LINE_COLORS, lineFormView, lineRefusalText, submitLineForm, type LineFormState } from "./lineForm";

const S = officialId("mobilis/stop/S");
const A = officialId("mobilis/stop/A");
const K = officialId("mobilis/stop/K");
const NAMES = { S: "Estação Inventada", A: "Arrabalde Inventado", K: "Campus Exemplo" };

const stop = (id: string) => ({ id, name: id });
const validState = (ids: string[]): LineFormState => ({
  code: "99",
  name: "Linha Nova",
  color: LINE_COLORS[0],
  patternLabel: "Ida",
  isCircular: false,
  stops: ids.map(stop),
  durationText: "20",
  dayTypeCodes: ["weekday"],
  mode: "departures",
  departures: [{ hour: 9, minute: 0 }],
  frequency: { fromMinute: 360, toMinute: 1200, headwayMinutes: 30 },
});

describe("lineFormView: paragens diferentes", () => {
  it.each([
    [[S, S], false],
    [[S, S, K], false],
    [[S, K], true],
    [[S, K, S], true],
  ])("%j dá canSave %s", (ids, expected) => {
    expect(lineFormView(validState(ids)).canSave).toBe(expected);
  });
});

describe("lineRefusalText: paragens", () => {
  it("stops_distinct usa a chave nova e o mínimo", () => {
    const text = lineRefusalText("stops_distinct");
    expect(text.key).toBe("line_create.refusal.stops_distinct");
    expect(text.params).toEqual({ min: 2 });
    expect(t(text.key, text.params)).not.toBe(text.key);
  });
  it("stops_adjacent usa a chave nova", () => {
    const text = lineRefusalText("stops_adjacent");
    expect(text.key).toBe("line_create.refusal.stops_adjacent");
    expect(t(text.key)).not.toBe(text.key);
  });
});

describe("submitLineForm: paragens", () => {
  it("[S, S] é bloqueada sem tocar o banco", async () => {
    const { db, sqlite } = testDbWithSqlite();
    const raw: ImportDb = {
      exec: async (sql) => sqlite.exec(sql),
      run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
      all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
    };
    await importMobilis(raw, lineSeed(NAMES, [{ code: "1", color: "#7CB342", stops: [{ stop: "S" }, { stop: "A" }, { stop: "K" }], trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 3: 520 } }] }]));
    let touched = false;
    const fakeDb = new Proxy(db, {
      get(target, prop, receiver) {
        touched = true;
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(await submitLineForm(fakeDb, validState([S, S]), 1_800_000_000_000)).toEqual({ kind: "blocked" });
    expect(touched).toBe(false);
  });
});
