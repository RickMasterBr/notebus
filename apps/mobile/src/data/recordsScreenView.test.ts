// Dados inventados (D-091). Testes puros da função recordsScreenRows.
import { describe, expect, it } from "vitest";
import type { RecordsScreenModel, RecordsPendingItem, WeekSummary } from "./recordsScreen";
import type { TripCardModel, TripDayGroup } from "./recordsTrips";
import { recordsScreenRows } from "./recordsScreenView";

function makeCard(id: string, opts?: { lineCode?: string; noAlight?: boolean }): TripCardModel {
  return {
    kind: "trip",
    boardingId: id,
    alightingId: null,
    line: { code: opts?.lineCode ?? "1", color: "#FF0000" },
    fromName: "Ponto A",
    toName: "Ponto B",
    timeText: "08:00",
    durationMin: null,
    deltaText: null,
    verifyState: null,
    noAlight: opts?.noAlight ?? false,
    ongoing: false,
    a11y: "Linha 1, 08:00",
  };
}

function makePendingReview(id: string): RecordsPendingItem {
  return {
    kind: "review",
    row: {
      id,
      time: "08:00",
      line: { code: "1", color: "#FF0000" },
      stop: { id: "stop-1", name: "Ponto A" },
      kind: "boarded",
      verifyState: "pending",
      observedAt: 1000,
      serviceDate: "2026-11-08",
      observation: {} as any,
    },
  };
}

function emptyModel(): RecordsScreenModel {
  return {
    now: null,
    pending: [],
    pendingTotal: 0,
    pendingPreview: [],
    noAlightIds: new Set(),
    thisWeek: [],
    olderWeeks: [],
    lines: [],
  };
}

describe("recordsScreenRows", () => {
  it("lista vazia: devolve linha empty", () => {
    const model = emptyModel();
    const rows = recordsScreenRows(model, { lineFilter: null });
    expect(rows).toEqual([{ type: "empty", key: "empty" }]);
  });

  it("só Agora: mostra cabeçalho e cartão now, sem empty e sem allChecked", () => {
    const model: RecordsScreenModel = {
      ...emptyModel(),
      now: makeCard("now-1"),
    };
    const rows = recordsScreenRows(model, { lineFilter: null });
    expect(rows).toEqual([
      {
        type: "sectionHeader",
        key: "header-now",
        titleKey: "sheet_records.section.now",
      },
      {
        type: "now",
        key: "now-now-1",
        card: model.now!,
      },
    ]);
  });

  it("5 para conferir dá 3 mais seeAll com 5", () => {
    const p1 = makePendingReview("p-1");
    const p2 = makePendingReview("p-2");
    const p3 = makePendingReview("p-3");
    const p4 = makePendingReview("p-4");
    const p5 = makePendingReview("p-5");
    const model: RecordsScreenModel = {
      ...emptyModel(),
      pending: [p1, p2, p3, p4, p5],
      pendingTotal: 5,
      pendingPreview: [p1, p2, p3, p4, p5],
    };
    const rows = recordsScreenRows(model, { lineFilter: null });
    expect(rows).toEqual([
      {
        type: "sectionHeader",
        key: "header-pending",
        titleKey: "sheet_records.section.pending",
      },
      { type: "pending", key: "pending-p-1", item: p1 },
      { type: "pending", key: "pending-p-2", item: p2 },
      { type: "pending", key: "pending-p-3", item: p3 },
      { type: "seeAll", key: "see-all", n: 5 },
    ]);
  });

  it("0 para conferir com registros dá allChecked", () => {
    const day: TripDayGroup = {
      serviceDate: "2026-11-08",
      label: "Hoje",
      items: [makeCard("trip-1")],
    };
    const model: RecordsScreenModel = {
      ...emptyModel(),
      pendingTotal: 0,
      thisWeek: [day],
    };
    const rows = recordsScreenRows(model, { lineFilter: null });
    expect(rows.some((r) => r.type === "allChecked")).toBe(true);
    expect(rows[0]).toEqual({ type: "allChecked", key: "all-checked" });
  });

  it("semana expandida e recolhida: recolhida tem só a linha week; expandida traz os dias logo depois", () => {
    const dayInOlderWeek: TripDayGroup = {
      serviceDate: "2026-10-20",
      label: "ter 20/10",
      items: [makeCard("trip-old-1")],
    };

    const collapsedWeek: WeekSummary = {
      weekStart: "2026-10-19",
      tripCount: 1,
      pendingCount: 0,
      days: null,
    };
    const collapsedModel: RecordsScreenModel = {
      ...emptyModel(),
      olderWeeks: [collapsedWeek],
    };

    const collapsedRows = recordsScreenRows(collapsedModel, { lineFilter: null });
    expect(collapsedRows).toEqual([
      { type: "allChecked", key: "all-checked" },
      {
        type: "sectionHeader",
        key: "header-older-weeks",
        titleKey: "records.older_weeks",
      },
      {
        type: "week",
        key: "week-2026-10-19",
        week: collapsedWeek,
        expanded: false,
      },
    ]);

    const expandedWeek: WeekSummary = {
      weekStart: "2026-10-19",
      tripCount: 1,
      pendingCount: 0,
      days: [dayInOlderWeek],
    };
    const expandedModel: RecordsScreenModel = {
      ...emptyModel(),
      olderWeeks: [expandedWeek],
    };

    const expandedRows = recordsScreenRows(expandedModel, { lineFilter: null });
    expect(expandedRows).toEqual([
      { type: "allChecked", key: "all-checked" },
      {
        type: "sectionHeader",
        key: "header-older-weeks",
        titleKey: "records.older_weeks",
      },
      {
        type: "week",
        key: "week-2026-10-19",
        week: expandedWeek,
        expanded: true,
      },
      {
        type: "dayHeader",
        key: "day-2026-10-19-2026-10-20",
        label: "ter 20/10",
        serviceDate: "2026-10-20",
      },
      {
        type: "trip",
        key: "trip-trip-old-1",
        card: expect.objectContaining({ boardingId: "trip-old-1" }),
        askAlight: false,
      },
    ]);
  });

  it("uma linha só não mostra chips; duas ou mais mostram", () => {
    const singleLineModel: RecordsScreenModel = {
      ...emptyModel(),
      lines: [{ code: "1", color: "#FF0000" }],
      thisWeek: [
        {
          serviceDate: "2026-11-08",
          label: "Hoje",
          items: [makeCard("trip-1")],
        },
      ],
    };
    const singleRows = recordsScreenRows(singleLineModel, { lineFilter: null });
    expect(singleRows.some((r) => r.type === "chips")).toBe(false);

    const multiLineModel: RecordsScreenModel = {
      ...emptyModel(),
      lines: [
        { code: "1", color: "#FF0000" },
        { code: "2", color: "#00FF00" },
      ],
      thisWeek: [
        {
          serviceDate: "2026-11-08",
          label: "Hoje",
          items: [makeCard("trip-1")],
        },
      ],
    };
    const multiRows = recordsScreenRows(multiLineModel, { lineFilter: "2" });
    expect(multiRows[0]).toEqual({
      type: "chips",
      key: "chips",
      lines: multiLineModel.lines,
      selected: "2",
    });
  });

  it("chaves únicas em uma lista completa", () => {
    const p1 = makePendingReview("p-1");
    const p2: RecordsPendingItem = {
      kind: "noAlight",
      card: makeCard("no-alight-1", { noAlight: true }),
    };
    const model: RecordsScreenModel = {
      lines: [
        { code: "1", color: "#FF0000" },
        { code: "2", color: "#00FF00" },
      ],
      now: makeCard("now-1"),
      pending: [p1, p2],
      pendingTotal: 4,
      pendingPreview: [p1, p2],
      noAlightIds: new Set(["no-alight-1"]),
      thisWeek: [
        {
          serviceDate: "2026-11-08",
          label: "Hoje",
          items: [
            makeCard("trip-1"),
            {
              kind: "passed",
              id: "pass-1",
              row: {
                id: "pass-1",
                time: "09:00",
                line: { code: "1", color: "#f00" },
                stop: { id: "s-1", name: "Ponto A" },
                kind: "passed",
                verifyState: null,
                observedAt: 2000,
                serviceDate: "2026-11-08",
                observation: {} as any,
              },
            },
          ],
        },
      ],
      olderWeeks: [
        {
          weekStart: "2026-11-01",
          tripCount: 1,
          pendingCount: 0,
          days: [
            {
              serviceDate: "2026-11-02",
              label: "seg 02/11",
              items: [makeCard("trip-older-1")],
            },
          ],
        },
      ],
    };
    const rows = recordsScreenRows(model, { lineFilter: null });
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
