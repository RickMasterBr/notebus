import { describe, expect, it } from "vitest";
import type { AlarmEventRow, AlarmRow } from "../db/alarms";
import { noTripNotices } from "./alarmNoTripNotice";

const baseRow = {
  source: "user" as const,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
};

const TODAY = "2026-11-06";

function alarm(id: string, anchorBaseMinute = 479): AlarmRow {
  return {
    ...baseRow,
    id,
    optionId: `opt-${id}`,
    anchorTripId: `trip-${id}`,
    anchorBaseMinute,
    weekdays: [],
    onceDate: TODAY,
    validFrom: TODAY,
    validTo: null,
    enabled: true,
  };
}

let seq = 0;

function event(
  alarmId: string,
  serviceDate: string,
  state: AlarmEventRow["state"],
  skipReason: AlarmEventRow["skipReason"] = null,
): AlarmEventRow {
  seq += 1;
  return {
    ...baseRow,
    id: `ev-${seq}`,
    alarmId,
    plannedAt: seq * 1000,
    serviceDate,
    tripId: "t1",
    state,
    skipReason,
    actedAt: null,
    snoozedTo: null,
  };
}

describe("alarmNoTripNotice: aviso de ônibus que deixou de existir (ideia 242)", () => {
  it("sem eventos, não devolve texto", () => {
    const notices = noTripNotices([alarm("a1")], [], TODAY);
    expect(notices.size).toBe(0);
  });

  it("só dias no_trip futuros: desde é o primeiro dia pulado", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-08", "skipped", "no_trip"),
        event("a1", "2026-11-07", "skipped", "no_trip"),
      ],
      TODAY,
    );
    expect(notices.get("a1")).toBe("O ônibus das 07:59 não existe mais desde 07/11");
  });

  it("dia bom ontem e no_trip de hoje em diante: desde é o primeiro no_trip depois do bom", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-05", "delivered"),
        event("a1", "2026-11-07", "skipped", "no_trip"),
        event("a1", "2026-11-06", "skipped", "no_trip"),
      ],
      TODAY,
    );
    expect(notices.get("a1")).toBe("O ônibus das 07:59 não existe mais desde 06/11");
  });

  it("dia bom hoje e no_trip futuro: desde é o no_trip de amanhã", () => {
    const notices = noTripNotices(
      [alarm("a1", 500)],
      [
        event("a1", "2026-11-06", "scheduled"),
        event("a1", "2026-11-09", "skipped", "no_trip"),
        event("a1", "2026-11-07", "skipped", "no_trip"),
      ],
      TODAY,
    );
    expect(notices.get("a1")).toBe("O ônibus das 08:20 não existe mais desde 07/11");
  });

  it("no_trip antigo, evento bom hoje e nenhum no_trip futuro: sem texto", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-01", "skipped", "no_trip"),
        event("a1", "2026-11-06", "delivered"),
      ],
      TODAY,
    );
    expect(notices.size).toBe(0);
  });

  it("no_trip só no passado: sem texto", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-01", "skipped", "no_trip"),
        event("a1", "2026-11-02", "skipped", "no_trip"),
      ],
      TODAY,
    );
    expect(notices.size).toBe(0);
  });

  it("sem dia bom, desde é a menor de todas as datas no_trip", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-01", "skipped", "no_trip"),
        event("a1", "2026-11-07", "skipped", "no_trip"),
      ],
      TODAY,
    );
    expect(notices.get("a1")).toBe("O ônibus das 07:59 não existe mais desde 01/11");
  });

  it("ignora pulos por holiday, override e season", () => {
    const notices = noTripNotices(
      [alarm("a1")],
      [
        event("a1", "2026-11-07", "skipped", "holiday"),
        event("a1", "2026-11-08", "skipped", "override"),
        event("a1", "2026-11-09", "skipped", "season"),
      ],
      TODAY,
    );
    expect(notices.size).toBe(0);
  });

  it("trata cada aviso separadamente", () => {
    const notices = noTripNotices(
      [alarm("a1", 479), alarm("a2", 500)],
      [
        event("a1", "2026-11-07", "skipped", "no_trip"),
        event("a2", "2026-11-06", "delivered"),
      ],
      TODAY,
    );
    expect(notices.size).toBe(1);
    expect(notices.get("a1")).toBe("O ônibus das 07:59 não existe mais desde 07/11");
    expect(notices.has("a2")).toBe(false);
  });
});
