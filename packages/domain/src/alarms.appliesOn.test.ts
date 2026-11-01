import { describe, expect, it } from "vitest";
import { alarmAppliesOn, type AlarmRule } from "./alarms.ts";

// Regra "o aviso vale nesta data" (invenção de teste, D-091). 2026-10-07 é quarta-feira (dayOfWeek 3).
const base: AlarmRule = {
  id: "a1",
  optionId: "o1",
  anchorTripId: "t1",
  anchorBaseMinute: 490,
  weekdays: [],
  onceDate: null,
  validFrom: "2026-10-01",
  validTo: null,
  enabled: true,
};

describe("alarmAppliesOn", () => {
  it("data única: vale só na própria data", () => {
    const once = { ...base, onceDate: "2026-10-07" };
    expect(alarmAppliesOn(once, "2026-10-07")).toBe(true);
    expect(alarmAppliesOn(once, "2026-10-08")).toBe(false);
  });

  it("dia da semana: vale nas quartas, não nas quintas", () => {
    const weekly = { ...base, weekdays: [3] };
    expect(alarmAppliesOn(weekly, "2026-10-07")).toBe(true);
    expect(alarmAppliesOn(weekly, "2026-10-14")).toBe(true);
    expect(alarmAppliesOn(weekly, "2026-10-08")).toBe(false);
  });

  it("fora da vigência ou desligado: não vale", () => {
    const weekly = { ...base, weekdays: [3], validTo: "2026-10-10" };
    expect(alarmAppliesOn(weekly, "2026-09-30")).toBe(false); // antes do início (e nem é quarta)
    expect(alarmAppliesOn({ ...weekly, validFrom: "2026-10-08" }, "2026-10-07")).toBe(false); // quarta antes de validFrom
    expect(alarmAppliesOn(weekly, "2026-10-14")).toBe(false); // quarta depois de validTo
    expect(alarmAppliesOn({ ...weekly, enabled: false }, "2026-10-07")).toBe(false);
  });
});
