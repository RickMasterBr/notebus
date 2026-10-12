import { describe, expect, it } from "vitest";
import { stopsIssue, validateLineDraft, type LineDraft, type StopsIssue } from "./lineDraft";

const base = (stopIds: string[], isCircular?: boolean): LineDraft => ({
  code: "99",
  name: "Estação – Hospital",
  color: "#1A73E8",
  pattern: { label: "sentido Hospital", stopIds, isCircular },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  departures: [{ hour: 7, minute: 30 }],
});

const reasonsOf = (draft: LineDraft) => {
  const r = validateLineDraft(draft);
  if (r.ok) throw new Error("devia recusar");
  return r.reasons;
};

describe("stopsIssue", () => {
  const table: [string[], StopsIssue | null][] = [
    [[], "stops_min"],
    [["a"], "stops_min"],
    [["a", "a"], "stops_distinct"],
    [["a", "a", "a"], "stops_distinct"],
    [["a", "b"], null],
    [["a", "a", "b"], "stops_adjacent"],
    [["a", "b", "b"], "stops_adjacent"],
    [["a", "b", "b", "a"], "stops_adjacent"],
    [["a", "b", "a"], null],
    [["a", "b", "c", "b", "a"], null],
  ];
  it.each(table)("%j dá %s", (ids, expected) => {
    expect(stopsIssue(ids)).toBe(expected);
  });
});

describe("validateLineDraft: paragens", () => {
  it("a mesma paragem duas vezes é recusada como stops_distinct", () => {
    expect(reasonsOf(base(["a", "a"]))).toEqual(["stops_distinct"]);
  });
  it("paragem repetida em seguida é recusada como stops_adjacent", () => {
    expect(reasonsOf(base(["a", "a", "b"]))).toEqual(["stops_adjacent"]);
  });
  it("uma paragem só continua stops_min", () => {
    expect(reasonsOf(base(["a"]))).toEqual(["stops_min"]);
  });
  it("linha circular (A, B, A) vale", () => {
    expect(validateLineDraft(base(["a", "b", "a"], true)).ok).toBe(true);
  });
});
