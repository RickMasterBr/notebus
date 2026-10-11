import { describe, expect, it } from "vitest";
import { LINE_LIMITS, validateLineDraft, type LineDraft, type LineDraftReason } from "./lineDraft";

const base = (over: Partial<LineDraft> = {}): LineDraft => ({
  code: "99",
  name: "Estação – Hospital",
  color: "#1A73E8",
  pattern: { label: "sentido Hospital", stopIds: ["a", "b", "c"] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  departures: [{ hour: 7, minute: 30 }],
  ...over,
});

const reasonsOf = (draft: LineDraft): LineDraftReason[] => {
  const r = validateLineDraft(draft);
  if (r.ok) throw new Error("devia recusar");
  return r.reasons;
};

describe("LINE_LIMITS", () => {
  it("fixa os limites: código 6, nome 60, rótulo 60, duração 300, mínimo de 2 paragens", () => {
    expect(LINE_LIMITS).toEqual({ codeMax: 6, nameMax: 60, patternLabelMax: 60, durationMax: 300, stopsMin: 2 });
  });
});

describe("validateLineDraft", () => {
  it("aceita um rascunho com horários avulsos e normaliza", () => {
    const r = validateLineDraft(
      base({ code: " 99 ", name: " Linha ", departures: [{ hour: 8, minute: 0 }, { hour: 1, minute: 10 }, { hour: 8, minute: 0 }] }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        code: "99",
        name: "Linha",
        color: "#1A73E8",
        pattern: { label: "sentido Hospital", stopIds: ["a", "b", "c"], isCircular: false },
        durationMinutes: 20,
        dayTypeCodes: ["weekday"],
        departureMinutes: [480, 1510],
        frequency: null,
      },
    });
  });

  it("T-84 pela frequência: 27 saídas, e a referência pode ser outra paragem", () => {
    const r = validateLineDraft(base({ departures: undefined, frequency: { fromMinute: 410, toMinute: 1190, headwayMinutes: 30, refPosition: 2 } }));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toHaveLength(27);
    expect(r.value.departureMinutes[0]).toBe(400); // 410 na 2ª paragem de 3, viagem de 20 min → 400 na 1ª
    expect(r.value.frequency).toEqual({ refPosition: 2, fromMinute: 410, toMinute: 1190, headwayMinutes: 30 });
  });

  it("T-85: a frequência que passa da meia-noite guarda o fim com +1440", () => {
    const r = validateLineDraft(base({ departures: undefined, frequency: { fromMinute: 1320, toMinute: 30, headwayMinutes: 30 } }));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toEqual([1320, 1350, 1380, 1410, 1440, 1470]);
    expect(r.value.frequency?.toMinute).toBe(1470);
  });

  it("cada motivo, separado", () => {
    expect(reasonsOf(base({ code: "  " }))).toEqual(["code_required"]);
    expect(reasonsOf(base({ code: "1234567" }))).toEqual(["code_too_long"]);
    expect(reasonsOf(base({ name: "" }))).toEqual(["name_required"]);
    expect(reasonsOf(base({ name: "x".repeat(61) }))).toEqual(["name_too_long"]);
    expect(reasonsOf(base({ color: "azul" }))).toEqual(["color_invalid"]);
    expect(reasonsOf(base({ color: "#12345" }))).toEqual(["color_invalid"]);
    expect(reasonsOf(base({ pattern: { label: " ", stopIds: ["a", "b"] } }))).toEqual(["pattern_label_required"]);
    expect(reasonsOf(base({ pattern: { label: "x".repeat(61), stopIds: ["a", "b"] } }))).toEqual(["pattern_label_too_long"]);
    expect(reasonsOf(base({ pattern: { label: "p", stopIds: ["a"] } }))).toEqual(["stops_min"]);
    expect(reasonsOf(base({ dayTypeCodes: [] }))).toEqual(["day_types_required"]);
    expect(reasonsOf(base({ departures: undefined }))).toEqual(["times_required"]);
    expect(reasonsOf(base({ departures: [] }))).toEqual(["times_required"]);
    expect(reasonsOf(base({ departures: [{ hour: 24, minute: 0 }] }))).toEqual(["times_invalid"]);
    expect(reasonsOf(base({ departures: [{ hour: 7, minute: 60 }] }))).toEqual(["times_invalid"]);
  });

  it("duração: 0, negativa, fracionária e acima de 300 recusam; 1 e 300 passam", () => {
    for (const durationMinutes of [0, -1, 2.5, 301, Number.NaN]) {
      expect(reasonsOf(base({ durationMinutes }))).toEqual(["duration_invalid"]);
    }
    expect(validateLineDraft(base({ durationMinutes: 1 })).ok).toBe(true);
    expect(validateLineDraft(base({ durationMinutes: 300 })).ok).toBe(true);
  });

  it("duas paragens passam; paragem repetida (circular) passa", () => {
    expect(validateLineDraft(base({ pattern: { label: "p", stopIds: ["a", "b"] } })).ok).toBe(true);
    expect(validateLineDraft(base({ pattern: { label: "p", stopIds: ["a", "b", "a"], isCircular: true } })).ok).toBe(true);
  });

  it("horários avulsos e frequência juntos → times_conflict", () => {
    expect(reasonsOf(base({ frequency: { fromMinute: 400, toMinute: 500, headwayMinutes: 30 } }))).toEqual(["times_conflict"]);
  });

  it("repassa os motivos da frequência", () => {
    const f = (frequency: NonNullable<LineDraft["frequency"]>) => reasonsOf(base({ departures: undefined, frequency }));
    expect(f({ fromMinute: 400, toMinute: 500, headwayMinutes: 0 })).toEqual(["invalid_headway"]);
    expect(f({ fromMinute: 400, toMinute: 1440, headwayMinutes: 30 })).toEqual(["invalid_range"]);
    expect(f({ fromMinute: 0, toMinute: 300, headwayMinutes: 1 })).toEqual(["too_many"]);
  });

  it("referência fora das paragens, ou que empurra a 1ª saída para antes de 00:00, recusa", () => {
    const f = (refPosition: number, fromMinute = 400) =>
      reasonsOf(base({ departures: undefined, frequency: { fromMinute, toMinute: 500, headwayMinutes: 30, refPosition } }));
    expect(f(0)).toEqual(["ref_position_invalid"]);
    expect(f(4)).toEqual(["ref_position_invalid"]);
    expect(f(1.5)).toEqual(["ref_position_invalid"]);
    expect(f(3, 5)).toEqual(["ref_position_invalid"]); // 5 − 20 < 0
  });

  it("junta vários motivos de campos diferentes", () => {
    expect(reasonsOf(base({ code: "", color: "x", dayTypeCodes: [] }))).toEqual(["code_required", "color_invalid", "day_types_required"]);
  });
});
