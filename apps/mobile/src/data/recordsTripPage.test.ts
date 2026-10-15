import { describe, expect, it } from "vitest";
import { lisbonWallClock, type TripData } from "@notebus/domain";
import { tripPageModel } from "./recordsTripPage";
import type { ObservationRow, RideRow } from "./registro";
import type { RecordsSnapshotDeps } from "./recordsList";
import type { ScheduleSnapshot } from "./schedule";

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

function makeFullSnapshot(): ScheduleSnapshot {
  const trip1: TripData = {
    id: "trip-1",
    patternId: "pattern-1",
    firstPosition: 0,
    lastPosition: 2,
    stopTimes: [
      { position: 0, serviceMinute: 490, origin: "official" }, // 08:10
      { position: 2, serviceMinute: 526, origin: "official" }, // 08:46
    ],
  };

  return {
    calendar: { holidays: [], overrides: [] },
    schedule: {
      timetables: [],
      seasons: [],
      trips: [{ id: "trip-1", timetableId: "tt-1", dayTypes: ["weekday"], seasonId: null }],
    },
    patterns: [
      {
        id: "pattern-1",
        stops: [
          { position: 0, stopId: "stop-1", isTimepoint: true },
          { position: 1, stopId: "stop-2", isTimepoint: false },
          { position: 2, stopId: "stop-3", isTimepoint: true },
        ],
      },
    ],
    trips: [trip1],
    patternLine: new Map([["pattern-1", { code: "1", color: "#111111" }]]),
    patternLineId: new Map([["pattern-1", "line-1"]]),
    lineInfo: new Map([["line-1", { code: "1", color: "#111111" }]]),
    patternStopIds: new Map([
      ["pattern-1:0", "ps-1"],
      ["pattern-1:1", "ps-2"],
      ["pattern-1:2", "ps-3"],
    ]),
    patternStopById: new Map([
      ["ps-1", { patternId: "pattern-1", position: 0, stopId: "stop-1" }],
      ["ps-2", { patternId: "pattern-1", position: 1, stopId: "stop-2" }],
      ["ps-3", { patternId: "pattern-1", position: 2, stopId: "stop-3" }],
    ]),
    stopNames: new Map([
      ["stop-1", "Arrabalde da Ponte"],
      ["stop-2", "Campus 2 ULO"],
      ["stop-3", "Estação"],
    ]),
  };
}

describe("recordsTripPage", () => {
  const TODAY = "2026-10-14";
  const NOW = lisbonMs(TODAY, "15:00");
  const snapshot = makeFullSnapshot();

  it("modelo null para embarque apagado e para id inexistente", () => {
    const deletedBoard = makeRow({
      id: "board-del",
      observedAt: lisbonMs(TODAY, "08:00"),
      deletedAt: NOW,
    });

    expect(
      tripPageModel({
        boardingId: "board-del",
        observations: [deletedBoard],
        rides: [],
        snapshot,
        now: NOW,
      }),
    ).toBeNull();

    expect(
      tripPageModel({
        boardingId: "non-existent-id",
        observations: [],
        rides: [],
        snapshot,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("modelo completo de viagem com embarque e descida", () => {
    const board = makeRow({
      id: "board-1",
      stopId: "stop-1",
      lineId: "line-1",
      observedAt: lisbonMs(TODAY, "08:13"),
      deviationMin: 3,
      matchStatus: "auto",
      patternStopId: "ps-1",
      tripId: "trip-1",
      note: "Peguei com chuva",
      rideId: "ride-1",
    });
    const alight = makeRow({
      id: "alight-1",
      stopId: "stop-2",
      lineId: "line-1",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:46"),
      rideId: "ride-1",
    });
    const ride = makeRide({
      id: "ride-1",
      boardingObservationId: "board-1",
      alightingObservationId: "alight-1",
      status: "closed",
    });

    const page = tripPageModel({
      boardingId: "board-1",
      observations: [board, alight],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    expect(page).not.toBeNull();
    expect(page!.line.code).toBe("1");
    expect(page!.fromName).toBe("Arrabalde da Ponte");
    expect(page!.toName).toBe("Campus 2 ULO");
    expect(page!.durationMin).toBe(33);
    expect(page!.dayLabel).toBe("Hoje");
    expect(page!.ongoing).toBe(false);
    expect(page!.boarding.id).toBe("board-1");
    expect(page!.boarding.time).toBe("08:13");
    expect(page!.boarding.stopName).toBe("Arrabalde da Ponte");
    // tabela: 08:10 (posição 0 de trip-1)
    expect(page!.boarding.tableTime).toBe("08:10");
    expect(page!.boarding.delta).toEqual({ key: "sheet_record.relative.late", n: 3 });
    expect(page!.alighting).toEqual({
      id: "alight-1",
      time: "08:46",
      stopName: "Campus 2 ULO",
    });
    expect(page!.learn).toBe("learns");
    expect(page!.originTable).toEqual({
      time: "08:10",
      stopName: "Arrabalde da Ponte",
    });
    expect(page!.note).toBe("Peguei com chuva");
    expect(page!.verifyId).toBeNull();
    expect(page!.deleteKind).toBe("pair");
  });

  it("tableTime com baseTimeAt que lança (posição sem vizinhos) → null sem exceção", () => {
    // Viagem com dados de stopTimes vazios em posição inválida que lança no domínio
    const brokenTrip: TripData = {
      id: "trip-broken",
      patternId: "pattern-1",
      firstPosition: 0,
      lastPosition: 2,
      stopTimes: [], // sem stopTimes dentro do trecho -> baseTimeAt lança erro
    };

    const brokenSnapshot: ScheduleSnapshot = {
      ...snapshot,
      trips: [brokenTrip],
    };

    const board = makeRow({
      id: "board-broken",
      observedAt: lisbonMs(TODAY, "08:00"),
      tripId: "trip-broken",
      patternStopId: "ps-1",
    });

    let page: ReturnType<typeof tripPageModel> = null;
    expect(() => {
      page = tripPageModel({
        boardingId: "board-broken",
        observations: [board],
        rides: [],
        snapshot: brokenSnapshot,
        now: NOW,
      });
    }).not.toThrow();

    expect(page).not.toBeNull();
    expect(page!.boarding.tableTime).toBeNull();
  });

  it("tableTime usa o embarque em vez da descida", () => {
    // embarque na posição 0 (08:10), descida na posição 2 (08:46)
    const board = makeRow({
      id: "board-check-time",
      observedAt: lisbonMs(TODAY, "08:13"),
      tripId: "trip-1",
      patternStopId: "ps-1", // pos 0
      rideId: "r-check",
    });
    const alight = makeRow({
      id: "alight-check-time",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:46"),
      tripId: "trip-1",
      patternStopId: "ps-3", // pos 2
      rideId: "r-check",
    });
    const ride = makeRide({
      id: "r-check",
      boardingObservationId: "board-check-time",
      alightingObservationId: "alight-check-time",
    });

    const page = tripPageModel({
      boardingId: "board-check-time",
      observations: [board, alight],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    expect(page!.boarding.tableTime).toBe("08:10"); // e não 08:46 da descida
  });

  it("learn com orphan → 'unmatched' e learn com manual e tudo preenchido → 'learns'", () => {
    const orphanBoard = makeRow({
      id: "board-orphan",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "orphan",
      tripId: "trip-1",
      patternStopId: "ps-1",
      deviationMin: 2,
      serviceDate: TODAY,
    });
    const orphanPage = tripPageModel({
      boardingId: "board-orphan",
      observations: [orphanBoard],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(orphanPage!.learn).toBe("unmatched");

    const manualBoard = makeRow({
      id: "board-manual",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "manual",
      tripId: "trip-1",
      patternStopId: "ps-1",
      deviationMin: 0,
      serviceDate: TODAY,
    });
    const manualPage = tripPageModel({
      boardingId: "board-manual",
      observations: [manualBoard],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(manualPage!.learn).toBe("learns");
  });

  it("deleteKind é pair com descida viva e single sem descida viva", () => {
    const boardWithAlight = makeRow({ id: "b1", observedAt: lisbonMs(TODAY, "08:00"), rideId: "r1" });
    const alightLive = makeRow({ id: "a1", kind: "alighted", observedAt: lisbonMs(TODAY, "08:30"), rideId: "r1" });
    const ride1 = makeRide({ id: "r1", boardingObservationId: "b1", alightingObservationId: "a1" });

    const pagePair = tripPageModel({
      boardingId: "b1",
      observations: [boardWithAlight, alightLive],
      rides: [ride1],
      snapshot,
      now: NOW,
    });
    expect(pagePair!.deleteKind).toBe("pair");

    const boardSingle = makeRow({ id: "b2", observedAt: lisbonMs(TODAY, "09:00"), rideId: "r2" });
    const rideSingle = makeRide({ id: "r2", boardingObservationId: "b2", alightingObservationId: null });

    const pageSingle = tripPageModel({
      boardingId: "b2",
      observations: [boardSingle],
      rides: [rideSingle],
      snapshot,
      now: NOW,
    });
    expect(pageSingle!.deleteKind).toBe("single");
  });

  it("verifyId só em registro a conferir", () => {
    // 1. Registro verificado -> verifyId null
    const normal = makeRow({ id: "b-norm", observedAt: lisbonMs(TODAY, "08:00"), matchStatus: "auto" });
    const normalPage = tripPageModel({
      boardingId: "b-norm",
      observations: [normal],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(normalPage!.verifyId).toBeNull();

    // 2. Registro orphan pendente -> verifyId é o id
    const orphan = makeRow({
      id: "b-orph",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "orphan",
      reviewDismissedAt: null,
    });
    const orphanPage = tripPageModel({
      boardingId: "b-orph",
      observations: [orphan],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(orphanPage!.verifyId).toBe("b-orph");

    // 3. Registro ambiguous dispensado (notVerified) -> verifyId é o id
    const dismissed = makeRow({
      id: "b-dism",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "ambiguous",
      reviewDismissedAt: lisbonMs(TODAY, "08:05"),
    });
    const dismissedPage = tripPageModel({
      boardingId: "b-dism",
      observations: [dismissed],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(dismissedPage!.verifyId).toBe("b-dism");
  });

  it("note vazia ou espaços vira null", () => {
    const emptyNote = makeRow({ id: "b-en", observedAt: lisbonMs(TODAY, "08:00"), note: "   " });
    const pageEmpty = tripPageModel({
      boardingId: "b-en",
      observations: [emptyNote],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(pageEmpty!.note).toBeNull();

    const nullNote = makeRow({ id: "b-nn", observedAt: lisbonMs(TODAY, "08:00"), note: null });
    const pageNull = tripPageModel({
      boardingId: "b-nn",
      observations: [nullNote],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(pageNull!.note).toBeNull();

    const goodNote = makeRow({ id: "b-gn", observedAt: lisbonMs(TODAY, "08:00"), note: "Muito cheio" });
    const pageGood = tripPageModel({
      boardingId: "b-gn",
      observations: [goodNote],
      rides: [],
      snapshot,
      now: NOW,
    });
    expect(pageGood!.note).toBe("Muito cheio");
  });

  it("FN-2: tableTime com baseTimeAt interpolado arredonda para baixo (HH:MM sem fração)", () => {
    // 14:00 (840) na pos. 0 e 14:08 (848) na pos. 3 -> pos. 1 tem minuto fracionário 842.6666...
    const interpTrip: TripData = {
      id: "trip-interp",
      patternId: "pattern-interp",
      firstPosition: 0,
      lastPosition: 3,
      stopTimes: [
        { position: 0, serviceMinute: 840, origin: "official" },
        { position: 3, serviceMinute: 848, origin: "official" },
      ],
    };
    const snap: ScheduleSnapshot = {
      ...snapshot,
      trips: [interpTrip],
      patterns: [
        {
          id: "pattern-interp",
          stops: [
            { position: 0, stopId: "stop-1", isTimepoint: true },
            { position: 1, stopId: "stop-2", isTimepoint: false },
            { position: 2, stopId: "stop-3", isTimepoint: false },
            { position: 3, stopId: "stop-4", isTimepoint: true },
          ],
        },
      ],
      patternStopIds: new Map([
        ["pattern-interp:0", "psi-0"],
        ["pattern-interp:1", "psi-1"],
        ["pattern-interp:2", "psi-2"],
        ["pattern-interp:3", "psi-3"],
      ]),
      patternStopById: new Map([
        ["psi-0", { patternId: "pattern-interp", position: 0, stopId: "stop-1" }],
        ["psi-1", { patternId: "pattern-interp", position: 1, stopId: "stop-2" }],
        ["psi-2", { patternId: "pattern-interp", position: 2, stopId: "stop-3" }],
        ["psi-3", { patternId: "pattern-interp", position: 3, stopId: "stop-4" }],
      ]),
    };

    const board = makeRow({
      id: "board-interp",
      observedAt: lisbonMs(TODAY, "14:05"),
      tripId: "trip-interp",
      patternStopId: "psi-1",
    });

    const page = tripPageModel({
      boardingId: "board-interp",
      observations: [board],
      rides: [],
      snapshot: snap,
      now: NOW,
    });

    expect(page).not.toBeNull();
    expect(page!.boarding.tableTime).toBe("14:02");
    expect(page!.boarding.tableTime).toMatch(/^\d{2}:\d{2}$/);
    expect(page!.boarding.tableTime).not.toMatch(/[.,]/);
  });

  it("Gêmeo do FN-2: originTable com baseTimeAt interpolado no firstPosition arredonda para baixo (HH:MM sem fração)", () => {
    // firstPosition = 1; horários nas posições 0 (840) e 3 (848) -> pos. 1 tem minuto fracionário 842.6666...
    const interpOriginTrip: TripData = {
      id: "trip-interp-origin",
      patternId: "pattern-interp",
      firstPosition: 1,
      lastPosition: 3,
      stopTimes: [
        { position: 0, serviceMinute: 840, origin: "official" },
        { position: 3, serviceMinute: 848, origin: "official" },
      ],
    };
    const snap: ScheduleSnapshot = {
      ...snapshot,
      trips: [interpOriginTrip],
      patterns: [
        {
          id: "pattern-interp",
          stops: [
            { position: 0, stopId: "stop-1", isTimepoint: true },
            { position: 1, stopId: "stop-2", isTimepoint: false },
            { position: 2, stopId: "stop-3", isTimepoint: false },
            { position: 3, stopId: "stop-4", isTimepoint: true },
          ],
        },
      ],
      patternStopIds: new Map([
        ["pattern-interp:0", "psi-0"],
        ["pattern-interp:1", "psi-1"],
        ["pattern-interp:2", "psi-2"],
        ["pattern-interp:3", "psi-3"],
      ]),
      patternStopById: new Map([
        ["psi-0", { patternId: "pattern-interp", position: 0, stopId: "stop-1" }],
        ["psi-1", { patternId: "pattern-interp", position: 1, stopId: "stop-2" }],
        ["psi-2", { patternId: "pattern-interp", position: 2, stopId: "stop-3" }],
        ["psi-3", { patternId: "pattern-interp", position: 3, stopId: "stop-4" }],
      ]),
    };

    const board = makeRow({
      id: "board-interp-origin",
      observedAt: lisbonMs(TODAY, "14:05"),
      tripId: "trip-interp-origin",
      patternStopId: "psi-1",
    });

    const page = tripPageModel({
      boardingId: "board-interp-origin",
      observations: [board],
      rides: [],
      snapshot: snap,
      now: NOW,
    });

    expect(page).not.toBeNull();
    expect(page!.originTable).not.toBeNull();
    expect(page!.originTable!.time).toBe("14:02");
    expect(page!.originTable!.time).toMatch(/^\d{2}:\d{2}$/);
    expect(page!.originTable!.time).not.toMatch(/[.,]/);
  });
});
