// Dados inventados (D-091). Linhas de `ObservationRow`/`RideRow` feitas à mão, como em `recordsTrips.test.ts`.
// Cada teste traz o valor esperado calculado à mão no comentário.
import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, lisbonWallClock } from "@notebus/domain";
import type { ObservationRow, RideRow } from "./registro";
import type { RecordsSnapshotDeps } from "./recordsList";
import {
  buildRecordsScreen,
  unansweredNoAlight,
  type RecordsScreenModel,
} from "./recordsScreen";

const lisbonMs = (date: string, hhmm: string, ss = "00") =>
  Date.parse(`${date}T${hhmm}:${ss}Z`) - 3_600_000;

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
    note: partial.note ?? null,
    deletedAt: partial.deletedAt ?? null,
    serviceDate: partial.serviceDate ?? lisbonWallClock(partial.observedAt).date,
    serviceMinute: 500,
    patternStopId: partial.patternStopId ?? "ps-1",
    tripId: partial.tripId ?? "trip-1",
    matchStatus: partial.matchStatus ?? "auto",
    deviationMin: partial.deviationMin !== undefined ? partial.deviationMin : 0,
    rideId: partial.rideId ?? null,
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

function makeRide(partial: Partial<RideRow> & { id: string; boardingObservationId: string }): RideRow {
  return {
    id: partial.id,
    source: "user",
    boardingObservationId: partial.boardingObservationId,
    alightingObservationId: partial.alightingObservationId ?? null,
    tripId: partial.tripId ?? null,
    status: partial.status ?? "closed",
    deletedAt: partial.deletedAt ?? null,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

const snapshot: RecordsSnapshotDeps = {
  lineInfo: new Map([
    ["line-1", { code: "1", color: "#111111" }],
    ["line-2", { code: "2", color: "#222222" }],
    ["line-9", { code: "9", color: "#999999" }],
  ]),
  stopNames: new Map([
    ["stop-1", "Arrabalde da Ponte"],
    ["stop-2", "Campus 2 ULO"],
  ]),
};

/** Um cartão de viagem: embarque + descida no mesmo `ride` fechado. */
function trip(prefix: string, lineId: string, date: string, boardAt: string, alightAt: string) {
  const board = makeRow({ id: `${prefix}-b`, lineId, observedAt: lisbonMs(date, boardAt), rideId: `${prefix}-r` });
  const alight = makeRow({
    id: `${prefix}-a`,
    lineId,
    stopId: "stop-2",
    kind: "alighted",
    observedAt: lisbonMs(date, alightAt),
    rideId: `${prefix}-r`,
  });
  const ride = makeRide({ id: `${prefix}-r`, boardingObservationId: board.id, alightingObservationId: alight.id });
  return { observations: [board, alight], rides: [ride], boardingId: board.id };
}

/** Uma viagem fechada sem descida: o embarque casado que pede "Onde você desceu?". */
function noAlightTrip(prefix: string, lineId: string, date: string, boardAt: string) {
  const board = makeRow({ id: `${prefix}-b`, lineId, observedAt: lisbonMs(date, boardAt), rideId: `${prefix}-r` });
  const ride = makeRide({ id: `${prefix}-r`, boardingObservationId: board.id, alightingObservationId: null });
  return { observations: [board], rides: [ride], boardingId: board.id };
}

const TODAY = "2026-10-14"; // quarta-feira; a semana começou a 12/10.
const THIS_WEEK_START = "2026-10-12";
const LAST_WEEK_START = "2026-10-05";
const TWO_WEEKS_AGO_START = "2026-09-28";
const NOW = lisbonMs(TODAY, "15:00");

function mainScreen() {
  const t1 = trip("t1", "line-1", "2026-10-12", "08:00", "08:30");
  const t2 = trip("t2", "line-2", "2026-10-14", "09:00", "09:20");
  const t3 = trip("t3", "line-1", "2026-10-05", "08:00", "08:30");
  const t4 = noAlightTrip("t4", "line-2", "2026-10-07", "08:00");
  const t5 = trip("t5", "line-2", "2026-10-01", "08:00", "08:30");
  // O cartão "Agora": uma viagem aberta hoje.
  const nowBoard = makeRow({ id: "now-b", lineId: "line-1", observedAt: lisbonMs(TODAY, "15:00"), rideId: "now-r" });
  const nowRide = makeRide({ id: "now-r", boardingObservationId: "now-b", status: "open" });
  // Dois registros para conferir (órfão e ambíguo).
  const r1 = makeRow({ id: "r1", observedAt: lisbonMs("2026-10-14", "09:30"), matchStatus: "ambiguous" });
  const r2 = makeRow({ id: "r2", observedAt: lisbonMs("2026-10-13", "18:00"), matchStatus: "orphan", lineId: "line-2" });

  const observations = [
    ...t1.observations,
    ...t2.observations,
    ...t3.observations,
    ...t4.observations,
    ...t5.observations,
    nowBoard,
    r1,
    r2,
  ];
  const rides = [...t1.rides, ...t2.rides, ...t3.rides, ...t4.rides, ...t5.rides, nowRide];
  const input = {
    observations,
    rides,
    snapshot,
    now: NOW,
    lineFilter: null,
    expandedWeeks: new Set([LAST_WEEK_START]),
  };
  return { input, t1, t2, t3, t4, t5, r1, r2 };
}

describe("unansweredNoAlight", () => {
  it("entra o embarque casado (auto ou manual) de viagem fechada, viva e sem descida, sem review_dismissed_at", () => {
    const auto = makeRow({ id: "auto", observedAt: lisbonMs(TODAY, "08:00") });
    const manual = makeRow({ id: "manual", observedAt: lisbonMs(TODAY, "08:10"), matchStatus: "manual" });
    const rides = [
      makeRide({ id: "r-auto", boardingObservationId: "auto" }),
      makeRide({ id: "r-manual", boardingObservationId: "manual" }),
    ];
    expect(unansweredNoAlight([auto, manual], rides)).toEqual(["manual", "auto"]);
  });

  it("ignora aberta, apagada, com descida, órfã, ambígua, dispensada e embarque apagado", () => {
    const base = makeRow({ id: "ok", observedAt: lisbonMs(TODAY, "08:00") });
    const open = makeRow({ id: "open", observedAt: lisbonMs(TODAY, "08:01") });
    const deletedRide = makeRow({ id: "del-ride", observedAt: lisbonMs(TODAY, "08:02") });
    const withAlight = makeRow({ id: "with-alight", observedAt: lisbonMs(TODAY, "08:03") });
    const orphan = makeRow({ id: "orphan", observedAt: lisbonMs(TODAY, "08:04"), matchStatus: "orphan" });
    const ambiguous = makeRow({ id: "ambiguous", observedAt: lisbonMs(TODAY, "08:05"), matchStatus: "ambiguous" });
    const dismissed = makeRow({
      id: "dismissed",
      observedAt: lisbonMs(TODAY, "08:06"),
      reviewDismissedAt: lisbonMs(TODAY, "09:00"),
    });
    const deletedBoard = makeRow({ id: "del-board", observedAt: lisbonMs(TODAY, "08:07"), deletedAt: NOW });
    const passed = makeRow({ id: "passed", observedAt: lisbonMs(TODAY, "08:08"), kind: "passed" });

    const observations = [base, open, deletedRide, withAlight, orphan, ambiguous, dismissed, deletedBoard, passed];
    const rides = [
      makeRide({ id: "r-base", boardingObservationId: "ok" }),
      makeRide({ id: "r-open", boardingObservationId: "open", status: "open" }),
      makeRide({ id: "r-del", boardingObservationId: "del-ride", deletedAt: NOW }),
      makeRide({ id: "r-alight", boardingObservationId: "with-alight", alightingObservationId: "some-alight" }),
      makeRide({ id: "r-orphan", boardingObservationId: "orphan" }),
      makeRide({ id: "r-ambiguous", boardingObservationId: "ambiguous" }),
      makeRide({ id: "r-dismissed", boardingObservationId: "dismissed" }),
      makeRide({ id: "r-del-board", boardingObservationId: "del-board" }),
      makeRide({ id: "r-passed", boardingObservationId: "passed" }),
      makeRide({ id: "r-missing", boardingObservationId: "não-existe" }),
    ];
    expect(unansweredNoAlight(observations, rides)).toEqual(["ok"]);
  });
});

describe("buildRecordsScreen", () => {
  it("Agora, Para conferir, esta semana, semanas anteriores e linhas", () => {
    const { input, t1, t2, t3, t4, t5 } = mainScreen();
    const model: RecordsScreenModel = buildRecordsScreen(input);

    // "Agora" é o cartão do ride aberto.
    expect(model.now?.boardingId).toBe("now-b");

    // Para conferir: os dois registros e a viagem sem descida, do mais novo ao mais antigo.
    expect(model.pending.map((p) => (p.kind === "review" ? p.row.id : p.card.boardingId))).toEqual([
      "r1",
      "r2",
      t4.boardingId,
    ]);
    expect(model.pending.map((p) => p.kind)).toEqual(["review", "review", "noAlight"]);
    expect(model.pendingTotal).toBe(3);
    expect(model.pendingPreview).toEqual(model.pending);
    expect([...model.noAlightIds]).toEqual([t4.boardingId]);

    // Esta semana (12/10 a 18/10): quarta antes de segunda na lista (do mais novo ao mais antigo).
    expect(model.thisWeek.map((d) => d.serviceDate)).toEqual(["2026-10-14", "2026-10-12"]);
    expect(model.thisWeek[0]!.items.map((i) => (i.kind === "trip" ? i.boardingId : i.id))).toEqual([t2.boardingId]);
    expect(model.thisWeek[1]!.items.map((i) => (i.kind === "trip" ? i.boardingId : i.id))).toEqual([t1.boardingId]);

    // Semanas anteriores: a de 05/10 aberta (2 viagens, 1 para conferir) e a de 28/09 recolhida.
    expect(model.olderWeeks.map((w) => w.weekStart)).toEqual([LAST_WEEK_START, TWO_WEEKS_AGO_START]);
    expect([model.olderWeeks[0]!.tripCount, model.olderWeeks[0]!.pendingCount]).toEqual([2, 1]);
    expect(model.olderWeeks[0]!.days?.map((d) => d.serviceDate)).toEqual(["2026-10-07", "2026-10-05"]);
    expect([model.olderWeeks[1]!.tripCount, model.olderWeeks[1]!.pendingCount]).toEqual([1, 0]);
    expect(model.olderWeeks[1]!.days).toBeNull();
    expect(t3.boardingId).not.toBe(t5.boardingId);

    // Linhas: as dos itens de todas as semanas, em ordem numérica.
    expect(model.lines).toEqual([
      { code: "1", color: "#111111" },
      { code: "2", color: "#222222" },
    ]);
  });

  it("fronteira da semana: hoje segunda, quarta e domingo", () => {
    const cases: { today: string; thisWeekStart: string; previousWeekStart: string }[] = [
      { today: "2026-10-12", thisWeekStart: "2026-10-12", previousWeekStart: "2026-10-05" },
      { today: "2026-10-14", thisWeekStart: "2026-10-12", previousWeekStart: "2026-10-05" },
      { today: "2026-10-11", thisWeekStart: "2026-10-05", previousWeekStart: "2026-09-28" },
    ];
    for (const c of cases) {
      // Confirma o calendário à mão: 0 = domingo.
      expect(dayOfWeek(c.today)).toBe(c.today === "2026-10-11" ? 0 : c.today === "2026-10-12" ? 1 : 3);
      const inWeek = trip("w", "line-1", c.thisWeekStart, "08:00", "08:30");
      const sundayBefore = addDays(c.thisWeekStart, -1);
      const before = trip("p", "line-1", sundayBefore, "08:00", "08:30");
      const model = buildRecordsScreen({
        observations: [...inWeek.observations, ...before.observations],
        rides: [...inWeek.rides, ...before.rides],
        snapshot,
        now: lisbonMs(c.today, "15:00"),
        lineFilter: null,
        expandedWeeks: new Set(),
      });
      expect(model.thisWeek.map((d) => d.serviceDate)).toEqual([c.thisWeekStart]);
      expect(model.olderWeeks.map((w) => w.weekStart)).toEqual([c.previousWeekStart]);
      expect(model.olderWeeks[0]!.days).toBeNull();
    }
  });

  it("filtro por linha tira um dia e uma semana inteira e recalcula as contagens", () => {
    const { input, t1, t3, t4, t5 } = mainScreen();
    const only1 = buildRecordsScreen({ ...input, lineFilter: "1" });

    // Esta semana: só o dia 12/10 (linha 1); o dia 14/10 (linha 2) sai.
    expect(only1.thisWeek.map((d) => d.serviceDate)).toEqual(["2026-10-12"]);
    expect(only1.thisWeek[0]!.items.map((i) => (i.kind === "trip" ? i.boardingId : i.id))).toEqual([t1.boardingId]);
    // Semana de 05/10: fica o dia 05/10; o 07/10 era linha 2. A contagem volta a 1 viagem e 0 para conferir.
    expect(only1.olderWeeks.map((w) => w.weekStart)).toEqual([LAST_WEEK_START]);
    expect([only1.olderWeeks[0]!.tripCount, only1.olderWeeks[0]!.pendingCount]).toEqual([1, 0]);
    expect(only1.olderWeeks[0]!.days?.map((d) => d.serviceDate)).toEqual(["2026-10-05"]);
    // A semana de 28/09 era só linha 2: sai inteira.
    expect(t3.boardingId).not.toBe(t5.boardingId);
    expect(t4.boardingId).toBe("t4-b");
    // `lines`, `now` e `pending` não são filtrados.
    expect(only1.lines).toEqual([
      { code: "1", color: "#111111" },
      { code: "2", color: "#222222" },
    ]);
    expect(only1.now?.boardingId).toBe("now-b");
    expect(only1.pendingTotal).toBe(3);

    // Na linha 2 a viagem sem descida continua a contar como "para conferir".
    const only2 = buildRecordsScreen({ ...input, lineFilter: "2" });
    expect(only2.thisWeek.map((d) => d.serviceDate)).toEqual(["2026-10-14"]);
    expect(only2.olderWeeks.map((w) => w.weekStart)).toEqual([LAST_WEEK_START, TWO_WEEKS_AGO_START]);
    expect([only2.olderWeeks[0]!.tripCount, only2.olderWeeks[0]!.pendingCount]).toEqual([1, 1]);
    expect([only2.olderWeeks[1]!.tripCount, only2.olderWeeks[1]!.pendingCount]).toEqual([1, 0]);
  });

  it("pendingPreview com 5 itens devolve os 3 primeiros", () => {
    const rows = ["08:00", "09:00", "10:00", "11:00", "12:00"].map((hhmm, index) =>
      makeRow({
        id: `p${index}`,
        observedAt: lisbonMs(TODAY, hhmm),
        matchStatus: index % 2 === 0 ? "orphan" : "ambiguous",
      }),
    );
    const model = buildRecordsScreen({
      observations: rows,
      rides: [],
      snapshot,
      now: NOW,
      lineFilter: null,
      expandedWeeks: new Set(),
    });
    expect(model.pendingTotal).toBe(5);
    expect(model.pendingPreview).toHaveLength(3);
    expect(model.pendingPreview.map((p) => (p.kind === "review" ? p.row.id : p.card.boardingId))).toEqual([
      "p4",
      "p3",
      "p2",
    ]);
  });
});
