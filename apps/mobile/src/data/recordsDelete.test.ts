import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_DAYS,
  WINDOW_DAYS_STEP,
  hide,
  idsToHide,
  nextWindowDays,
  pruneRevived,
  unhide,
  visibleObservations,
} from "./recordsDelete";
import { buildTripsList } from "./recordsTrips";
import { homePendingInfo } from "./homePending";
import { reviewQueue } from "./review";
import type { ObservationRow, RideRow } from "./registro";
import { fixture, THURSDAY, lisbon, stopId, lineId, tripIdOf } from "./registroFixture";

function makeRow(partial: Partial<ObservationRow> & { id: string; observedAt: number }): ObservationRow {
  return {
    id: partial.id,
    stopId: partial.stopId ?? "stop-1",
    lineId: partial.lineId ?? "line-1",
    observedAt: partial.observedAt,
    observedEndAt: null,
    kind: partial.kind ?? "boarded",
    mode: "live",
    recordedAt: partial.observedAt,
    note: null,
    deletedAt: partial.deletedAt ?? null,
    serviceDate: "2026-10-15",
    serviceMinute: 500,
    patternStopId: "ps-1",
    tripId: partial.tripId ?? "trip-1",
    matchStatus: partial.matchStatus ?? "manual",
    deviationMin: 0,
    rideId: partial.rideId ?? null,
    matchRuleVersion: 1,
    reviewDismissedAt: null,
    source: "user",
    gpsLat: null,
    gpsLon: null,
    gpsAccuracyM: null,
    createdAt: partial.observedAt,
    updatedAt: partial.observedAt,
  };
}

describe("recordsDelete (Item 1 e lacunas R1 a R9)", () => {
  it("idsToHide: apagar par esconde os dois IDs", () => {
    const ids = idsToHide("board-1", "alight-1");
    expect(ids).toEqual(["board-1", "alight-1"]);
  });

  it("idsToHide: apagar linha avulsa esconde só o ID passado (R3)", () => {
    const ids = idsToHide("obs-single");
    expect(ids).toEqual(["obs-single"]);

    const idsWithNull = idsToHide("obs-single", null);
    expect(idsWithNull).toEqual(["obs-single"]);
  });

  it("hide e unhide: rollback tira exatamente os IDs que hide pôs (R2)", () => {
    const initial = new Set(["existing-1"]);
    const toDelete = idsToHide("b-1", "a-1");

    const hidden = hide(initial, toDelete);
    expect(hidden.has("b-1")).toBe(true);
    expect(hidden.has("a-1")).toBe(true);
    expect(hidden.has("existing-1")).toBe(true);
    expect(hidden.size).toBe(3);

    // Rollback no catch
    const rolledBack = unhide(hidden, toDelete);
    expect(rolledBack.has("b-1")).toBe(false);
    expect(rolledBack.has("a-1")).toBe(false);
    expect(rolledBack.has("existing-1")).toBe(true);
    expect(rolledBack.size).toBe(1);
  });

  it("pruneRevived: tira o ID que reapareceu com deletedAt == null e mantém o que continua apagado (R9)", () => {
    const deletedIds = new Set(["revived-1", "still-deleted-2", "absent-3"]);

    const observations = [
      { id: "revived-1", deletedAt: null },
      { id: "still-deleted-2", deletedAt: 123456 },
    ];

    const pruned = pruneRevived(deletedIds, observations);
    expect(pruned.has("revived-1")).toBe(false);
    expect(pruned.has("still-deleted-2")).toBe(true);
    expect(pruned.has("absent-3")).toBe(true);
  });

  it("pruneRevived: conjunto vazio devolve a mesma referência", () => {
    const empty = new Set<string>();
    expect(pruneRevived(empty, [{ id: "x", deletedAt: null }])).toBe(empty);
  });

  it("visibleObservations: não perde nenhum registro da fila 'Para conferir'", () => {
    const boardingConferred = makeRow({
      id: "board-conferred",
      matchStatus: "manual",
      observedAt: 1000,
    });
    const alightingConferred = makeRow({
      id: "alight-conferred",
      kind: "alighted",
      observedAt: 2000,
    });
    const pendingOrphan = makeRow({
      id: "pending-orphan",
      matchStatus: "orphan",
      observedAt: 1500,
    });
    const pendingAmbiguous = makeRow({
      id: "pending-ambiguous",
      matchStatus: "ambiguous",
      observedAt: 1600,
    });

    const observations = [boardingConferred, alightingConferred, pendingOrphan, pendingAmbiguous];
    const hidden = new Set(["board-conferred", "alight-conferred"]);

    const visible = visibleObservations(observations, hidden);
    expect(visible.map((o) => o.id)).toEqual(["pending-orphan", "pending-ambiguous"]);

    // Confere que a fila de conferência sobre os visíveis mantém exatamente os pendentes
    const queue = reviewQueue(visible);
    expect(queue.map((o) => o.id)).toEqual(["pending-ambiguous", "pending-orphan"]);
  });

  it("nextWindowDays: mantém dias se hasMore=false e avança passo de 14 se hasMore=true (R1, R7, R8)", () => {
    expect(DEFAULT_WINDOW_DAYS).toBe(14);
    expect(WINDOW_DAYS_STEP).toBe(14);

    expect(nextWindowDays(false, 14)).toBe(14);
    expect(nextWindowDays(true, 14)).toBe(28);
    expect(nextWindowDays(true, 28)).toBe(42);
  });

  describe("FN-1 reprodução em duas camadas", () => {
    it("(a) camada de lista: apagar par conferido não altera a contagem de Para conferir", () => {
      const boarding: ObservationRow = makeRow({
        id: "b-manual",
        matchStatus: "manual",
        rideId: "r-1",
        observedAt: 1000,
      });
      const alighting: ObservationRow = makeRow({
        id: "a-manual",
        kind: "alighted",
        matchStatus: "auto",
        rideId: "r-1",
        observedAt: 2000,
      });
      const pending: ObservationRow = makeRow({
        id: "p-orphan",
        matchStatus: "orphan",
        observedAt: 1500,
      });

      const rides: RideRow[] = [
        {
          id: "r-1",
          source: "user",
          boardingObservationId: "b-manual",
          alightingObservationId: "a-manual",
          tripId: "trip-1",
          status: "closed",
          deletedAt: null,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      const observations = [boarding, alighting, pending];

      const beforeList = buildTripsList({ observations, rides, snapshot: null, now: 3000 });
      const beforeHome = homePendingInfo(observations);

      expect(beforeList.pending.length).toBe(1);
      expect(beforeHome?.count).toBe(1);

      // Ocultar par apagado
      const hidden = hide(new Set<string>(), idsToHide("b-manual", "a-manual"));
      const visible = visibleObservations(observations, hidden);

      const afterList = buildTripsList({ observations: visible, rides, snapshot: null, now: 3000 });
      const afterHome = homePendingInfo(visible);

      // Não cai: reproduz que na camada de lista o pendente permanece
      expect(afterList.pending.length).toBe(1);
      expect(afterHome?.count).toBe(1);
    });

    it("(b) camada de dados: remove() no banco em memória não altera a fila de Para conferir", async () => {
      const f = await fixture();

      // 1. Registro pendente (orphan)
      await f.registro.board({
        stopId: stopId("A"),
        lineId: lineId("1"),
        at: lisbon(THURSDAY, "09:30"),
      });
      await f.registro.refreshDeductions(Date.now());

      // 2. Registro conferido (manual) com descida
      const manual = await f.registro.board({
        stopId: stopId("A"),
        lineId: lineId("1"),
        at: lisbon(THURSDAY, "08:12", "30"),
      });
      await f.registro.chooseManual(
        manual.observationId,
        { tripId: tripIdOf("1", "0810"), position: 2, serviceDate: THURSDAY },
        lisbon(THURSDAY, "08:13"),
      );
      await f.registro.alight({
        rideId: manual.rideId,
        stopId: stopId("K"),
        patternId: f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId,
        position: 5,
        at: lisbon(THURSDAY, "08:40"),
      });

      // Antes
      let loaded = await f.registro.load();
      const queueBefore = reviewQueue(loaded.observations);
      expect(queueBefore.length).toBe(1);

      // Apagar viagem conferida
      await f.registro.remove(manual.observationId, lisbon(THURSDAY, "10:00"));

      // Depois
      loaded = await f.registro.load();
      const queueAfter = reviewQueue(loaded.observations);

      // Não cai: na camada de dados o pendente permanece
      expect(queueAfter.length).toBe(1);
    });

    it("(c) hipótese do settle no RegistroProvider: remove() seguido de refreshDeductions() não altera a fila de Para conferir", async () => {
      const f = await fixture();

      // 1. Registro pendente (orphan)
      await f.registro.board({
        stopId: stopId("A"),
        lineId: lineId("1"),
        at: lisbon(THURSDAY, "09:30"),
      });
      await f.registro.refreshDeductions(Date.now());

      // 2. Registro conferido (manual) com descida
      const manual = await f.registro.board({
        stopId: stopId("A"),
        lineId: lineId("1"),
        at: lisbon(THURSDAY, "08:12", "30"),
      });
      await f.registro.chooseManual(
        manual.observationId,
        { tripId: tripIdOf("1", "0810"), position: 2, serviceDate: THURSDAY },
        lisbon(THURSDAY, "08:13"),
      );
      await f.registro.alight({
        rideId: manual.rideId,
        stopId: stopId("K"),
        patternId: f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId,
        position: 5,
        at: lisbon(THURSDAY, "08:40"),
      });

      // Antes
      let loaded = await f.registro.load();
      const queueBefore = reviewQueue(loaded.observations);
      expect(queueBefore.length).toBe(1);

      // Simula exatamente o que o settle() do RegistroProvider executa após o remove:
      // remove() seguido de refreshDeductions()
      await f.registro.remove(manual.observationId, lisbon(THURSDAY, "10:00"));
      await f.registro.refreshDeductions(lisbon(THURSDAY, "10:00"));

      // Depois
      loaded = await f.registro.load();
      const queueAfter = reviewQueue(loaded.observations);

      // Descarta a hipótese: o contador da fila de conferência não cai
      expect(queueAfter.length).toBe(1);
    });
  });
});
