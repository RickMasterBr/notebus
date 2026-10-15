import { describe, expect, it } from "vitest";
import { lisbonWallClock } from "@notebus/domain";
import {
  buildTripsList,
  type TripCardModel,
  type LineItemModel,
} from "./recordsTrips";
import type { ObservationRow, RideRow } from "./registro";
import type { RecordsSnapshotDeps } from "./recordsList";

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

function makeSnapshot(): RecordsSnapshotDeps {
  return {
    lineInfo: new Map([
      ["line-1", { code: "1", color: "#111111" }],
      ["line-2", { code: "2", color: "#222222" }],
      ["line-9", { code: "9", color: "#999999" }],
    ]),
    stopNames: new Map([
      ["stop-1", "Arrabalde da Ponte"],
      ["stop-2", "Campus 2 ULO"],
      ["stop-3", "Estação"],
    ]),
  };
}

describe("recordsTrips", () => {
  const TODAY = "2026-10-14";
  const NOW = lisbonMs(TODAY, "15:00");
  const snapshot = makeSnapshot();

  it("par embarque + descida vira um cartão com duração e destino", () => {
    const board = makeRow({
      id: "obs-board",
      stopId: "stop-1",
      lineId: "line-1",
      observedAt: lisbonMs(TODAY, "08:13"),
      deviationMin: 3,
      matchStatus: "auto",
      rideId: "ride-1",
    });
    const alight = makeRow({
      id: "obs-alight",
      stopId: "stop-2",
      lineId: "line-1",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:46"),
      rideId: "ride-1",
    });
    const ride = makeRide({
      id: "ride-1",
      boardingObservationId: "obs-board",
      alightingObservationId: "obs-alight",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [board, alight],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.items).toHaveLength(1);
    const item = model.days[0]!.items[0] as TripCardModel;
    expect(item.kind).toBe("trip");
    expect(item.boardingId).toBe("obs-board");
    expect(item.alightingId).toBe("obs-alight");
    expect(item.fromName).toBe("Arrabalde da Ponte");
    expect(item.toName).toBe("Campus 2 ULO");
    // Regra: Math.round((08:46 - 08:13) / 60000) = 33 min
    expect(item.durationMin).toBe(33);
    expect(item.timeText).toBe("08:13 → 08:46 · 33 min");
    expect(item.deltaText).toBe("embarque 3 min depois da tabela");
    expect(item.noAlight).toBe(false);
    expect(item.ongoing).toBe(false);
    expect(item.a11y).toBe("Linha 1, Arrabalde da Ponte → Campus 2 ULO, 08:13 → 08:46 · 33 min");
  });

  it("descida sem embarque vivo e com ride não vira linha", () => {
    // Embarque apagado ou fora da lista
    const deletedBoard = makeRow({
      id: "obs-board-del",
      observedAt: lisbonMs(TODAY, "08:00"),
      deletedAt: NOW,
      rideId: "ride-del",
    });
    const alight = makeRow({
      id: "obs-alight-1",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:30"),
      rideId: "ride-del",
    });
    const ride = makeRide({
      id: "ride-del",
      boardingObservationId: "obs-board-del",
      alightingObservationId: "obs-alight-1",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [deletedBoard, alight],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    // Nem cartão nem linha de descida
    expect(model.days).toHaveLength(0);
    expect(model.now).toBeNull();
  });

  it("descida sem ride vira alighted_alone", () => {
    const orphanAlight = makeRow({
      id: "alight-alone",
      stopId: "stop-2",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "12:00"),
      rideId: null,
    });

    const model = buildTripsList({
      observations: [orphanAlight],
      rides: [],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.items).toHaveLength(1);
    const item = model.days[0]!.items[0] as LineItemModel;
    expect(item.kind).toBe("alighted_alone");
    expect(item.id).toBe("alight-alone");
    expect(item.row.id).toBe("alight-alone");
  });

  it("ride dismissed + observação passed vira linha fina e não cartão", () => {
    const passedObs = makeRow({
      id: "passed-1",
      kind: "passed",
      stopId: "stop-1",
      lineId: "line-9",
      observedAt: lisbonMs(TODAY, "12:20"),
      rideId: "ride-dismissed",
    });
    const ride = makeRide({
      id: "ride-dismissed",
      boardingObservationId: "passed-1",
      status: "dismissed",
    });

    const model = buildTripsList({
      observations: [passedObs],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.items).toHaveLength(1);
    const item = model.days[0]!.items[0] as LineItemModel;
    expect(item.kind).toBe("passed");
    expect(item.id).toBe("passed-1");
  });

  it("ride aberto vai para now e some dos dias", () => {
    const openBoard = makeRow({
      id: "board-open",
      stopId: "stop-1",
      lineId: "line-1",
      observedAt: lisbonMs(TODAY, "14:50"),
      rideId: "ride-open",
    });
    const openRide = makeRide({
      id: "ride-open",
      boardingObservationId: "board-open",
      status: "open",
    });

    const closedBoard = makeRow({
      id: "board-closed",
      stopId: "stop-1",
      lineId: "line-1",
      observedAt: lisbonMs(TODAY, "10:00"),
      rideId: "ride-closed",
    });
    const closedRide = makeRide({
      id: "ride-closed",
      boardingObservationId: "board-closed",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [openBoard, closedBoard],
      rides: [openRide, closedRide],
      snapshot,
      now: NOW,
    });

    expect(model.now).not.toBeNull();
    expect(model.now!.boardingId).toBe("board-open");
    expect(model.now!.ongoing).toBe(true);
    expect(model.now!.timeText).toBe("embarcou 14:50");

    // O cartão do ride aberto não aparece nos dias
    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.items).toHaveLength(1);
    expect((model.days[0]!.items[0] as TripCardModel).boardingId).toBe("board-closed");
  });

  it("noAlight só com ride fechado sem descida", () => {
    const boardClosedNoAlight = makeRow({
      id: "board-no-alight",
      observedAt: lisbonMs(TODAY, "09:00"),
      rideId: "ride-no-alight",
    });
    const rideClosed = makeRide({
      id: "ride-no-alight",
      boardingObservationId: "board-no-alight",
      status: "closed",
      alightingObservationId: null,
    });

    const model = buildTripsList({
      observations: [boardClosedNoAlight],
      rides: [rideClosed],
      snapshot,
      now: NOW,
    });

    const item = model.days[0]!.items[0] as TripCardModel;
    expect(item.noAlight).toBe(true);
    expect(item.ongoing).toBe(false);
    expect(item.timeText).toBe("09:00");
  });

  it("intervalo (observedEndAt) → durationMin: null", () => {
    const boardInterval = makeRow({
      id: "board-int",
      observedAt: lisbonMs(TODAY, "08:10"),
      observedEndAt: lisbonMs(TODAY, "08:15"),
      rideId: "ride-int",
    });
    const alightNormal = makeRow({
      id: "alight-norm",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:45"),
      rideId: "ride-int",
    });
    const ride = makeRide({
      id: "ride-int",
      boardingObservationId: "board-int",
      alightingObservationId: "alight-norm",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [boardInterval, alightNormal],
      rides: [ride],
      snapshot,
      now: NOW,
    });

    const item = model.days[0]!.items[0] as TripCardModel;
    expect(item.durationMin).toBeNull();
    expect(item.timeText).toBe("08:10–08:15 → 08:45");
  });

  it("diferença +3, 0 e −2 (textos certos, Math.abs)", () => {
    const makeWithDev = (id: string, dev: number, hhmm: string) =>
      makeRow({
        id,
        observedAt: lisbonMs(TODAY, hhmm),
        deviationMin: dev,
        matchStatus: "auto",
        rideId: `ride-${id}`,
      });

    const late = makeWithDev("late", 3.2, "08:00");
    const onTime = makeWithDev("ontime", -0.2, "09:00");
    const early = makeWithDev("early", -2.4, "10:00");

    const rides = [
      makeRide({ id: "ride-late", boardingObservationId: "late" }),
      makeRide({ id: "ride-ontime", boardingObservationId: "ontime" }),
      makeRide({ id: "ride-early", boardingObservationId: "early" }),
    ];

    const model = buildTripsList({
      observations: [late, onTime, early],
      rides,
      snapshot,
      now: NOW,
    });

    const items = model.days[0]!.items as TripCardModel[];
    // Ordenados do mais novo ao mais antigo: early (10:00), ontime (09:00), late (08:00)
    expect(items[0]!.deltaText).toBe("embarque 2 min antes da tabela");
    expect(items[1]!.deltaText).toBe("embarque na hora da tabela");
    expect(items[2]!.deltaText).toBe("embarque 3 min depois da tabela");
  });

  it("deltaText: null com matchStatus orphan/ambiguous", () => {
    const orphan = makeRow({
      id: "orphan",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "orphan",
      deviationMin: 5,
      rideId: "ride-orphan",
    });
    const ambiguous = makeRow({
      id: "ambiguous",
      observedAt: lisbonMs(TODAY, "09:00"),
      matchStatus: "ambiguous",
      deviationMin: 3,
      rideId: "ride-ambig",
    });

    const model = buildTripsList({
      observations: [orphan, ambiguous],
      rides: [
        makeRide({ id: "ride-orphan", boardingObservationId: "orphan" }),
        makeRide({ id: "ride-ambig", boardingObservationId: "ambiguous" }),
      ],
      snapshot,
      now: NOW,
    });

    const items = model.days[0]!.items as TripCardModel[];
    expect(items[0]!.deltaText).toBeNull();
    expect(items[1]!.deltaText).toBeNull();
  });

  it("ordenação dentro do dia: do mais novo ao mais antigo", () => {
    const obs1 = makeRow({ id: "obs-1", observedAt: lisbonMs(TODAY, "08:00"), rideId: "r1" });
    const obs2 = makeRow({ id: "obs-2", observedAt: lisbonMs(TODAY, "12:00"), rideId: "r2" });
    const obs3 = makeRow({ id: "obs-3", observedAt: lisbonMs(TODAY, "10:00"), kind: "passed" });

    const model = buildTripsList({
      observations: [obs1, obs2, obs3],
      rides: [
        makeRide({ id: "r1", boardingObservationId: "obs-1" }),
        makeRide({ id: "r2", boardingObservationId: "obs-2" }),
      ],
      snapshot,
      now: NOW,
    });

    const items = model.days[0]!.items;
    expect(items.map((i) => (i.kind === "trip" ? i.boardingId : i.id))).toEqual([
      "obs-2", // 12:00
      "obs-3", // 10:00
      "obs-1", // 08:00
    ]);
  });

  it("dia vazio descartado", () => {
    // Um dia com apenas uma descida associada a ride cujo embarque não está no dia
    // Se o grupo do dia ficar sem item, é descartado
    const YESTERDAY = "2026-10-13";
    const boardYesterday = makeRow({
      id: "board-yest",
      observedAt: lisbonMs(YESTERDAY, "10:00"),
      serviceDate: YESTERDAY,
      deletedAt: NOW, // embarque apagado
      rideId: "r-yest",
    });
    const alightYesterday = makeRow({
      id: "alight-yest",
      kind: "alighted",
      observedAt: lisbonMs(YESTERDAY, "10:30"),
      serviceDate: YESTERDAY,
      rideId: "r-yest",
    });

    const model = buildTripsList({
      observations: [boardYesterday, alightYesterday],
      rides: [makeRide({ id: "r-yest", boardingObservationId: "board-yest", alightingObservationId: "alight-yest" })],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(0);
  });

  it("embarque apagado esconde o cartão", () => {
    const deletedBoard = makeRow({
      id: "del-board",
      observedAt: lisbonMs(TODAY, "08:00"),
      deletedAt: NOW,
      rideId: "ride-del",
    });
    const model = buildTripsList({
      observations: [deletedBoard],
      rides: [makeRide({ id: "ride-del", boardingObservationId: "del-board" })],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(0);
    expect(model.now).toBeNull();
  });

  it("allChecked com e sem pendente, com e sem registro", () => {
    // 1. Sem nada: false
    const emptyModel = buildTripsList({
      observations: [],
      rides: [],
      snapshot: null,
      now: NOW,
    });
    expect(emptyModel.allChecked).toBe(false);

    // 2. Com registro verificado (sem pendente): true
    const verifiedBoard = makeRow({
      id: "v-board",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "auto",
      rideId: "r-v",
    });
    const verifiedModel = buildTripsList({
      observations: [verifiedBoard],
      rides: [makeRide({ id: "r-v", boardingObservationId: "v-board" })],
      snapshot,
      now: NOW,
    });
    expect(verifiedModel.pending).toHaveLength(0);
    expect(verifiedModel.allChecked).toBe(true);

    // 3. Com registro pendente: false
    const pendingBoard = makeRow({
      id: "p-board",
      observedAt: lisbonMs(TODAY, "08:00"),
      matchStatus: "orphan",
      reviewDismissedAt: null,
      rideId: "r-p",
    });
    const pendingModel = buildTripsList({
      observations: [pendingBoard],
      rides: [makeRide({ id: "r-p", boardingObservationId: "p-board" })],
      snapshot,
      now: NOW,
    });
    expect(pendingModel.pending).toHaveLength(1);
    expect(pendingModel.allChecked).toBe(false);

    // 4. Sem dias mas com `now`: allChecked true
    const openBoard = makeRow({
      id: "open-board",
      observedAt: lisbonMs(TODAY, "14:55"),
      matchStatus: "auto",
      rideId: "r-open",
    });
    const openModel = buildTripsList({
      observations: [openBoard],
      rides: [makeRide({ id: "r-open", boardingObservationId: "open-board", status: "open" })],
      snapshot,
      now: NOW,
    });
    expect(openModel.now).not.toBeNull();
    expect(openModel.days).toHaveLength(0);
    expect(openModel.allChecked).toBe(true);
  });

  it("hasMore e windowDays são repassados de buildRecordsList", () => {
    const oldObs = makeRow({
      id: "old-1",
      observedAt: lisbonMs("2026-09-01", "10:00"),
      serviceDate: "2026-09-01",
    });
    const todayObs = makeRow({
      id: "today-1",
      observedAt: lisbonMs(TODAY, "10:00"),
      serviceDate: TODAY,
    });

    const model = buildTripsList({
      observations: [oldObs, todayObs],
      rides: [],
      snapshot,
      now: NOW,
      windowDays: 7,
    });

    expect(model.windowDays).toBe(7);
    expect(model.hasMore).toBe(true);
  });

  it("2a, dia vazio descartado com outro dia presente", () => {
    const YESTERDAY = "2026-10-13";

    // Dia mais novo (TODAY): única linha é descida cujo ride existe mas cujo embarque está apagado
    const deletedBoardToday = makeRow({
      id: "board-today-del",
      observedAt: lisbonMs(TODAY, "08:00"),
      serviceDate: TODAY,
      deletedAt: NOW,
      rideId: "ride-today",
    });
    const alightToday = makeRow({
      id: "alight-today",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:30"),
      serviceDate: TODAY,
      rideId: "ride-today",
    });
    const rideToday = makeRide({
      id: "ride-today",
      boardingObservationId: "board-today-del",
      alightingObservationId: "alight-today",
      status: "closed",
    });

    // Dia mais antigo (YESTERDAY): viagem normal
    const boardYesterday = makeRow({
      id: "board-yest",
      observedAt: lisbonMs(YESTERDAY, "10:00"),
      serviceDate: YESTERDAY,
      rideId: "ride-yest",
    });
    const alightYesterday = makeRow({
      id: "alight-yest",
      kind: "alighted",
      observedAt: lisbonMs(YESTERDAY, "10:30"),
      serviceDate: YESTERDAY,
      rideId: "ride-yest",
    });
    const rideYesterday = makeRide({
      id: "ride-yest",
      boardingObservationId: "board-yest",
      alightingObservationId: "alight-yest",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [deletedBoardToday, alightToday, boardYesterday, alightYesterday],
      rides: [rideToday, rideYesterday],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(1);
    expect(model.days[0]!.serviceDate).toBe(YESTERDAY);
    expect(model.days[0]!.items).toHaveLength(1);
    expect((model.days[0]!.items[0] as TripCardModel).boardingId).toBe("board-yest");
  });

  it("2b, ride sem embarque vivo não gera cartão", () => {
    // No mesmo dia: um ride closed cujo embarque sumiu de observations + viagem normal
    const missingBoardId = "board-missing-from-obs";
    const alightOrphan = makeRow({
      id: "alight-orphan-ride",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "08:30"),
      serviceDate: TODAY,
      rideId: "ride-missing-board",
    });
    const rideWithMissingBoard = makeRide({
      id: "ride-missing-board",
      boardingObservationId: missingBoardId,
      alightingObservationId: "alight-orphan-ride",
      status: "closed",
    });

    // Viagem normal no mesmo dia
    const normalBoard = makeRow({
      id: "board-normal-day",
      observedAt: lisbonMs(TODAY, "14:00"),
      serviceDate: TODAY,
      rideId: "ride-normal-day",
    });
    const normalAlight = makeRow({
      id: "alight-normal-day",
      kind: "alighted",
      observedAt: lisbonMs(TODAY, "14:30"),
      serviceDate: TODAY,
      rideId: "ride-normal-day",
    });
    const normalRide = makeRide({
      id: "ride-normal-day",
      boardingObservationId: "board-normal-day",
      alightingObservationId: "alight-normal-day",
      status: "closed",
    });

    const model = buildTripsList({
      observations: [alightOrphan, normalBoard, normalAlight],
      rides: [rideWithMissingBoard, normalRide],
      snapshot,
      now: NOW,
    });

    expect(model.days).toHaveLength(1);
    const cards = model.days[0]!.items.filter((i): i is TripCardModel => i.kind === "trip");
    expect(cards.find((c) => c.boardingId === missingBoardId)).toBeUndefined();
    const alightedAlone = model.days[0]!.items.filter(
      (i): i is LineItemModel => i.kind === "alighted_alone",
    );
    expect(alightedAlone.find((l) => l.id === "alight-orphan-ride")).toBeUndefined();
    expect(model.days[0]!.items).toHaveLength(1);
    expect((model.days[0]!.items[0] as TripCardModel).boardingId).toBe("board-normal-day");
  });
});
