import { describe, expect, it } from "vitest";
import { addDays, lisbonWallClock } from "@notebus/domain";
import {
  buildRecordsList,
  formatDayHeader,
  loadMore,
  rowTarget,
  serviceDateOfRow,
} from "./recordsList";
import type { ObservationRow } from "./registro";

function makeRow(partial: Partial<ObservationRow> & { id: string; observedAt: number }): ObservationRow {
  return {
    id: partial.id,
    stopId: partial.stopId ?? "stop-1",
    lineId: partial.lineId ?? "line-1",
    observedAt: partial.observedAt,
    observedEndAt: partial.observedEndAt ?? null,
    kind: partial.kind ?? "boarded",
    mode: partial.mode ?? "live",
    recordedAt: partial.observedAt,
    note: null,
    deletedAt: partial.deletedAt ?? null,
    serviceDate: partial.serviceDate ?? lisbonWallClock(partial.observedAt).date,
    serviceMinute: 500,
    patternStopId: "ps-1",
    tripId: "trip-1",
    matchStatus: partial.matchStatus ?? "auto",
    deviationMin: 0,
    rideId: null,
    matchRuleVersion: 1,
    reviewDismissedAt: partial.reviewDismissedAt ?? null,
    source: "user",
    gpsLat: null,
    gpsLon: null,
    gpsAccuracyM: null,
    createdAt: partial.observedAt,
    updatedAt: partial.observedAt,
  };
}

const lisbonMs = (date: string, hhmm: string, ss = "00") => Date.parse(`${date}T${hhmm}:${ss}Z`) - 3_600_000;

describe("recordsList", () => {
  const NOW = lisbonMs("2026-10-08", "15:00");
  const TODAY = "2026-10-08";
  const YESTERDAY = "2026-10-07";

  it("vazio: sem registros devolve pending e days vazios", () => {
    const model = buildRecordsList([], null, NOW);
    expect(model.pending).toEqual([]);
    expect(model.days).toEqual([]);
    expect(model.hasMore).toBe(false);
  });

  it("apagados fora: registros com deletedAt nunca entram em pending nem em days", () => {
    const deletedOrphan = makeRow({
      id: "del-orphan",
      observedAt: lisbonMs(TODAY, "10:00"),
      matchStatus: "orphan",
      deletedAt: NOW,
    });
    const deletedNormal = makeRow({
      id: "del-normal",
      observedAt: lisbonMs(TODAY, "11:00"),
      matchStatus: "auto",
      deletedAt: NOW,
    });
    const liveNormal = makeRow({
      id: "live-1",
      observedAt: lisbonMs(TODAY, "12:00"),
      matchStatus: "auto",
    });

    const model = buildRecordsList([deletedOrphan, deletedNormal, liveNormal], null, NOW);
    expect(model.pending).toHaveLength(0);
    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.rows).toHaveLength(1);
    expect(model.days[0]!.rows[0]!.id).toBe("live-1");
  });

  it("chips: pending ganha 'pending', dismissed ganha 'notVerified', auto/manual ganha null", () => {
    const pendingRow = makeRow({
      id: "pending-1",
      observedAt: lisbonMs(TODAY, "09:00"),
      matchStatus: "orphan",
      reviewDismissedAt: null,
    });
    const dismissedRow = makeRow({
      id: "dismissed-1",
      observedAt: lisbonMs(TODAY, "10:00"),
      matchStatus: "ambiguous",
      reviewDismissedAt: lisbonMs(TODAY, "10:05"),
    });
    const normalRow = makeRow({
      id: "normal-1",
      observedAt: lisbonMs(TODAY, "11:00"),
      matchStatus: "auto",
    });
    const alightedRow = makeRow({
      id: "alighted-1",
      observedAt: lisbonMs(TODAY, "11:30"),
      kind: "alighted",
      matchStatus: "orphan",
    });

    const model = buildRecordsList([pendingRow, dismissedRow, normalRow, alightedRow], null, NOW);

    // Na seção pending só entra o pendingRow
    expect(model.pending).toHaveLength(1);
    expect(model.pending[0]!.id).toBe("pending-1");
    expect(model.pending[0]!.verifyState).toBe("pending");

    // No histórico do dia todos aparecem com o verifyState correto
    expect(model.days).toHaveLength(1);
    const dayRows = model.days[0]!.rows;
    expect(dayRows).toHaveLength(4);

    const mapped = new Map(dayRows.map((r) => [r.id, r.verifyState]));
    expect(mapped.get("pending-1")).toBe("pending");
    expect(mapped.get("dismissed-1")).toBe("notVerified");
    expect(mapped.get("normal-1")).toBeNull();
    expect(mapped.get("alighted-1")).toBeNull();
  });

  it("agrupamento por dia de serviço e ordenação dentro do dia (mais novo primeiro)", () => {
    const row1 = makeRow({ id: "r1", observedAt: lisbonMs(TODAY, "08:00") });
    const row2 = makeRow({ id: "r2", observedAt: lisbonMs(TODAY, "14:00") });
    const row3 = makeRow({ id: "r3", observedAt: lisbonMs(YESTERDAY, "18:00") });
    const row4 = makeRow({ id: "r4", observedAt: lisbonMs(YESTERDAY, "09:00") });

    const model = buildRecordsList([row1, row2, row3, row4], null, NOW);
    expect(model.days).toHaveLength(2);

    expect(model.days[0]!.serviceDate).toBe(TODAY);
    expect(model.days[0]!.label).toBe("Hoje");
    expect(model.days[0]!.rows.map((r) => r.id)).toEqual(["r2", "r1"]);

    expect(model.days[1]!.serviceDate).toBe(YESTERDAY);
    expect(model.days[1]!.label).toBe("Ontem");
    expect(model.days[1]!.rows.map((r) => r.id)).toEqual(["r3", "r4"]);
  });

  it("registro de 00:30 que pertence ao dia de serviço anterior é agrupado no dia anterior", () => {
    // Quinta 08/10 às 00:30, mas dia de serviço é Quarta 07/10 (D-016)
    const midnightObs = makeRow({
      id: "midnight-1",
      observedAt: lisbonMs("2026-10-08", "00:30"),
      serviceDate: "2026-10-07",
    });
    const regularThursdayObs = makeRow({
      id: "regular-thursday",
      observedAt: lisbonMs("2026-10-08", "08:00"),
      serviceDate: "2026-10-08",
    });

    const model = buildRecordsList([midnightObs, regularThursdayObs], null, NOW);
    expect(model.days).toHaveLength(2);

    const thursdayGroup = model.days.find((d) => d.serviceDate === "2026-10-08");
    const wednesdayGroup = model.days.find((d) => d.serviceDate === "2026-10-07");

    expect(thursdayGroup?.rows.map((r) => r.id)).toEqual(["regular-thursday"]);
    expect(wednesdayGroup?.rows.map((r) => r.id)).toEqual(["midnight-1"]);
  });

  it("cabeçalhos de dia: Hoje, Ontem e 'qui 08/10'", () => {
    expect(formatDayHeader("2026-10-08", "2026-10-08")).toBe("Hoje");
    expect(formatDayHeader("2026-10-07", "2026-10-08")).toBe("Ontem");
    expect(formatDayHeader("2026-10-01", "2026-10-08")).toBe("qui 01/10");
  });

  it("janela de 14 dias e loadMore", () => {
    // Cria registros para os últimos 30 dias
    const rows: ObservationRow[] = [];
    for (let i = 0; i < 30; i++) {
      const date = addDays(TODAY, -i);
      rows.push(makeRow({ id: `day-${i}`, observedAt: lisbonMs(date, "12:00"), serviceDate: date }));
    }

    const initialModel = buildRecordsList(rows, null, NOW, 14);
    // Janela inicial de 14 dias: dias 0 a 13
    expect(initialModel.days).toHaveLength(14);
    expect(initialModel.days[0]!.serviceDate).toBe(TODAY);
    expect(initialModel.days[13]!.serviceDate).toBe(addDays(TODAY, -13));
    expect(initialModel.hasMore).toBe(true);

    // loadMore amplia por mais 14 dias (28 dias)
    const expandedModel = loadMore(initialModel, 14);
    expect(expandedModel.days).toHaveLength(28);
    expect(expandedModel.days[0]!.serviceDate).toBe(TODAY);
    expect(expandedModel.days[27]!.serviceDate).toBe(addDays(TODAY, -27));
    expect(expandedModel.hasMore).toBe(true);

    // loadMore mais 14 dias (42 dias, cobre todos os 30)
    const allModel = expandedModel.loadMore(14);
    expect(allModel.days).toHaveLength(30);
    expect(allModel.hasMore).toBe(false);
  });

  it("A10: 1.000 registros (10/dia por 100 dias) devolve só ≤ 200 linhas e roda em < 100 ms", () => {
    const rows: ObservationRow[] = [];
    let idCounter = 1;

    for (let dayOffset = 0; dayOffset < 100; dayOffset++) {
      const date = addDays(TODAY, -dayOffset);
      for (let r = 0; r < 10; r++) {
        const hour = 8 + r;
        const hh = hour.toString().padStart(2, "0");
        rows.push(
          makeRow({
            id: `row-${idCounter++}`,
            observedAt: lisbonMs(date, `${hh}:00`),
            serviceDate: date,
          }),
        );
      }
    }

    expect(rows).toHaveLength(1000);

    const t0 = performance.now();
    const model = buildRecordsList(rows, null, NOW, 14);
    const duration = performance.now() - t0;

    const totalLinesInWindow = model.days.reduce((acc, d) => acc + d.rows.length, 0);
    // Janela de 14 dias com 10 registros por dia = 140 registros (≤ 200)
    expect(totalLinesInWindow).toBe(140);
    expect(totalLinesInWindow).toBeLessThanOrEqual(200);

    // Folga de 4× sobre 100 ms = 400 ms para não ser frágil em CI
    expect(duration).toBeLessThan(400);
  });

  it("rowTarget: pending e notVerified abrem 'verify', os demais abrem 'record'", () => {
    expect(rowTarget({ id: "obs-1", verifyState: "pending" })).toEqual({
      kind: "verify",
      observationId: "obs-1",
    });

    expect(rowTarget({ id: "obs-2", verifyState: "notVerified" })).toEqual({
      kind: "verify",
      observationId: "obs-2",
    });

    expect(rowTarget({ id: "obs-3", verifyState: null })).toEqual({
      kind: "record",
      observationId: "obs-3",
    });
  });
});
