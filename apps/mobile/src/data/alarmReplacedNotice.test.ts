import { describe, expect, it } from "vitest";
import { shouldAnnounceReplaced } from "./alarmReplacedNotice";

/** 05/11/2026 16:40 em Lisboa (WET, UTC+0), em epoch ms. */
const OLD_1640 = Date.UTC(2026, 10, 5, 16, 40);
const OLD_DATE = "2026-11-05";
const OLD_MINUTE = 16 * 60 + 40;

describe("shouldAnnounceReplaced: quando aparece o aviso de substituição (ideia 230)", () => {
  it("data única com o horário antigo já passado não anuncia", () => {
    const rep = { alarmId: "a1", weekdays: [], onceDate: OLD_DATE };
    expect(shouldAnnounceReplaced(rep, OLD_MINUTE, OLD_1640 + 60_000)).toBe(false);
  });

  it("data única com o horário antigo ainda por vir anuncia", () => {
    const rep = { alarmId: "a1", weekdays: [], onceDate: OLD_DATE };
    expect(shouldAnnounceReplaced(rep, OLD_MINUTE, OLD_1640 - 60_000)).toBe(true);
  });

  it("no instante exato do aviso antigo já não anuncia", () => {
    const rep = { alarmId: "a1", weekdays: [], onceDate: OLD_DATE };
    expect(shouldAnnounceReplaced(rep, OLD_MINUTE, OLD_1640)).toBe(false);
  });

  it("sem o horário do aviso antigo anuncia", () => {
    const rep = { alarmId: "a1", weekdays: [], onceDate: OLD_DATE };
    expect(shouldAnnounceReplaced(rep, null, OLD_1640 + 60_000)).toBe(true);
  });

  it("aviso que repete nos dias da semana anuncia mesmo com o horário no passado", () => {
    const rep = { alarmId: "a1", weekdays: [1, 2] };
    expect(shouldAnnounceReplaced(rep, OLD_MINUTE, OLD_1640 + 60_000)).toBe(true);
  });

  it("hora que não existe em março (lista vazia) anuncia", () => {
    const rep = { alarmId: "a1", weekdays: [], onceDate: "2026-03-29" };
    // 01:30 de 29/03/2026 não existiu no relógio de parede de Lisboa.
    expect(shouldAnnounceReplaced(rep, 90, Date.UTC(2026, 2, 29, 12, 0))).toBe(true);
  });
});
