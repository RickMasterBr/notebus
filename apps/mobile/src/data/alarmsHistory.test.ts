import { describe, expect, it } from "vitest";
import { historyList } from "./alarmsUi";
import type { AlarmEventRow } from "../db/alarms";

describe("E-06 Item 1: historyList com filtro temporal e dateText", () => {
  const baseRow = {
    source: "user" as const,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };

  const events: AlarmEventRow[] = [
    { ...baseRow, id: "e1", alarmId: "a1", serviceDate: "2026-10-20", tripId: "t1", plannedAt: 1000, state: "delivered", actedAt: null, snoozedTo: null, skipReason: null },
    { ...baseRow, id: "e2", alarmId: "a1", serviceDate: "2026-10-21", tripId: "t1", plannedAt: 2000, state: "scheduled", actedAt: null, snoozedTo: null, skipReason: null },
    { ...baseRow, id: "e3", alarmId: "a1", serviceDate: "2026-10-22", tripId: "t1", plannedAt: 3000, state: "scheduled", actedAt: null, snoozedTo: null, skipReason: null },
  ];

  it("com now especificado, eventos com plannedAt > now não entram no histórico", () => {
    const result = historyList(events, 2000);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("e2");
    expect(result[1]!.id).toBe("e1");
  });

  it("sem now, mantém o comportamento anterior e não filtra por plannedAt", () => {
    const result = historyList(events);
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe("e3");
    expect(result[1]!.id).toBe("e2");
    expect(result[2]!.id).toBe("e1");
  });

  it("cada item possui dateText no formato DD/MM e preserva serviceDate", () => {
    const item = historyList(events, 2000)[0]!;
    expect(item.serviceDate).toBe("2026-10-21");
    expect(item.dateText).toBe("21/10");
  });
});
