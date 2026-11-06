/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// A descida anotada depois (D-414, D-418) e a marca "Deixar para conferir" no embarque casado.
// Cada teste traz o valor esperado calculado à mão no comentário.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { type Fixture, THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";

const obsOf = async (f: Fixture, id: string) => (await selectLive(f.db, observation, eq(observation.id, id)))[0]!;
const rideOf = async (f: Fixture, id: string) => (await selectLive(f.db, ride, eq(ride.id, id)))[0]!;
const liveObservationCount = async (f: Fixture) => (await selectLive(f.db, observation)).length;

/** Embarque na Arrabalde (pos. 2 da L1), na viagem das 08:10 (base 492 = 08:12). */
const boardAtA = (f: Fixture, hhmm = "08:12", ss = "30") =>
  f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, hhmm, ss) });

/** O padrão da L1 (viagem das 08:10: pos. 2 = Arrabalde, pos. 5 = Campus). */
const l1Pattern = (f: Fixture) => f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;

/** Embarque já deduzido (auto) e viagem "dispensada" (fechada sem descida). */
async function dismissedRide(f: Fixture) {
  const board = await boardAtA(f);
  await f.registro.refreshDeductions(Date.now());
  await f.registro.dismiss(board.rideId, lisbon(THURSDAY, "08:35"));
  return board;
}

describe("alightLater: a descida anotada depois", () => {
  it("grava a descida numa viagem fechada pelo dismiss, com a hora pedida e modo later, sem reabrir", async () => {
    const f = await fixture();
    const board = await dismissedRide(f);
    const at = lisbon(THURSDAY, "10:00");
    const observedAt = lisbon(THURSDAY, "08:47");
    const result = await f.registro.alightLater({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      observedAt,
      at,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 08:12:30 → 08:47 = 34,5 min; meio minuto sobe (D-092) → 35.
    expect([result.minutes, result.at]).toEqual([35, at]);

    const a = await obsOf(f, result.token.observationId);
    expect([a.kind, a.mode, a.observedAt, a.recordedAt, a.rideId, a.stopId, a.lineId]).toEqual([
      "alighted",
      "later",
      observedAt,
      at,
      board.rideId,
      stopId("K"),
      lineId("1"),
    ]);
    // Modo diferente de `live` grava GPS nulo.
    expect([a.gpsLat, a.gpsLon, a.gpsAccuracyM]).toEqual([null, null, null]);
    const r = await rideOf(f, board.rideId);
    expect([r.status, r.alightingObservationId]).toEqual(["closed", a.id]);
  });

  it("desfazer: apaga a descida e deixa a viagem fechada sem descida", async () => {
    const f = await fixture();
    const board = await dismissedRide(f);
    const result = await f.registro.alightLater({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      observedAt: lisbon(THURSDAY, "08:47"),
      at: lisbon(THURSDAY, "10:00"),
    });
    if (!result.ok) throw new Error(result.problem);
    await f.registro.undoAlightLater(result.token, lisbon(THURSDAY, "10:05"));

    const r = await rideOf(f, board.rideId);
    expect([r.status, r.alightingObservationId]).toEqual(["closed", null]);
    expect(await liveObservationCount(f)).toBe(1);
  });

  it("recusa a viagem aberta sem gravar nada", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const result = await f.registro.alightLater({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      observedAt: lisbon(THURSDAY, "08:47"),
      at: lisbon(THURSDAY, "10:00"),
    });
    expect(result).toEqual({ ok: false, problem: "a viagem não está fechada" });
    expect(await liveObservationCount(f)).toBe(1);
  });

  it("recusa a viagem que já tem descida", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const done = await f.registro.alight({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      at: lisbon(THURSDAY, "08:47"),
    });
    if (!done.ok) throw new Error(done.problem);
    const result = await f.registro.alightLater({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      observedAt: lisbon(THURSDAY, "08:50"),
      at: lisbon(THURSDAY, "10:00"),
    });
    expect(result).toEqual({ ok: false, problem: "a viagem já tem descida" });
    expect(await liveObservationCount(f)).toBe(2);
  });

  it("recusa a viagem inexistente ou apagada", async () => {
    const f = await fixture();
    const input = {
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      observedAt: lisbon(THURSDAY, "08:47"),
      at: lisbon(THURSDAY, "10:00"),
    };
    expect(await f.registro.alightLater({ ...input, rideId: "não-existe" })).toEqual({
      ok: false,
      problem: "viagem não encontrada",
    });

    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    await f.registro.undoBoard(board, lisbon(THURSDAY, "08:20"));
    expect(await f.registro.alightLater({ ...input, rideId: board.rideId })).toEqual({
      ok: false,
      problem: "viagem não encontrada",
    });
    expect(await liveObservationCount(f)).toBe(0);
  });

  it("recusa posição anterior e hora antes do embarque (invariante 5), sem gravar", async () => {
    const f = await fixture();
    const board = await dismissedRide(f);
    const base = {
      rideId: board.rideId,
      stopId: stopId("A"),
      patternId: l1Pattern(f),
      at: lisbon(THURSDAY, "10:00"),
    };
    const before = await f.registro.alightLater({ ...base, position: 2, observedAt: lisbon(THURSDAY, "08:47") });
    expect(before).toEqual({ ok: false, problem: expect.stringContaining("não vem depois") });
    const early = await f.registro.alightLater({ ...base, position: 5, observedAt: lisbon(THURSDAY, "08:00") });
    expect(early).toEqual({ ok: false, problem: expect.stringContaining("antes do embarque") });
    expect(await liveObservationCount(f)).toBe(1);
    expect((await rideOf(f, board.rideId)).alightingObservationId).toBeNull();
  });
});

describe("alight com observedAt e mode", () => {
  it("grava observedAt, recordedAt = at, mode later e GPS nulo; a duração usa observedAt", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "10:00");
    const observedAt = lisbon(THURSDAY, "08:47");
    const gps = { lat: 1, lon: 2, accuracyM: 3, atMs: at };
    const result = await f.registro.alight({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      at,
      observedAt,
      mode: "later",
      gps,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.minutes).toBe(35);
    const a = await obsOf(f, result.token.observationId);
    expect([a.observedAt, a.recordedAt, a.mode]).toEqual([observedAt, at, "later"]);
    expect([a.gpsLat, a.gpsLon, a.gpsAccuracyM]).toEqual([null, null, null]);
    expect((await rideOf(f, board.rideId)).status).toBe("closed");
  });

  it("o invariante 5 confere a hora de observedAt, não a do toque", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const result = await f.registro.alight({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      at: lisbon(THURSDAY, "10:00"),
      observedAt: lisbon(THURSDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, problem: expect.stringContaining("antes do embarque") });
    expect((await rideOf(f, board.rideId)).status).toBe("open");
  });

  it("sem os dois campos grava como hoje: observedAt = at e mode live", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "08:47");
    const result = await f.registro.alight({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      at,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = await obsOf(f, result.token.observationId);
    expect([a.observedAt, a.recordedAt, a.mode]).toEqual([at, at, "live"]);
  });
});

describe("Deixar para conferir grava a marca no embarque casado", () => {
  it("dismiss marca review_dismissed_at no embarque auto; undoDismiss limpa", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "08:35");
    await f.registro.dismiss(board.rideId, at);
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBe(at);
    expect((await rideOf(f, board.rideId)).status).toBe("closed");

    await f.registro.undoDismiss(board.rideId, lisbon(THURSDAY, "08:36"));
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBeNull();
    expect((await rideOf(f, board.rideId)).status).toBe("open");
  });

  it("dismiss num embarque por deduzir (sem casamento) não grava a marca", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.dismiss(board.rideId, lisbon(THURSDAY, "08:35"));
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBeNull();
  });

  it("dismissNoAlight marca uma viagem fechada sem descida; o desfazer limpa", async () => {
    const f = await fixture();
    const board = await dismissedRide(f);
    const at = lisbon(THURSDAY, "09:00");
    await f.registro.dismissNoAlight(board.rideId, at);
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBe(at);
    const r = await rideOf(f, board.rideId);
    expect([r.status, r.alightingObservationId]).toEqual(["closed", null]);

    await f.registro.undoDismissNoAlight(board.rideId, lisbon(THURSDAY, "09:01"));
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBeNull();
  });

  it("dismissNoAlight recusa a viagem aberta e a que já tem descida, sem gravar a marca", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    await expect(f.registro.dismissNoAlight(board.rideId, lisbon(THURSDAY, "09:00"))).rejects.toThrow("viagem não encontrada");
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBeNull();

    const done = await f.registro.alight({
      rideId: board.rideId,
      stopId: stopId("K"),
      patternId: l1Pattern(f),
      position: 5,
      at: lisbon(THURSDAY, "08:47"),
    });
    if (!done.ok) throw new Error(done.problem);
    await expect(f.registro.dismissNoAlight(board.rideId, lisbon(THURSDAY, "09:00"))).rejects.toThrow("viagem não encontrada");
    expect((await obsOf(f, board.observationId)).reviewDismissedAt).toBeNull();
  });

  it("boardOver com conferir deixa a viagem anterior sem a marca", async () => {
    const f = await fixture();
    const first = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const result = await f.registro.boardOver(
      { stopId: stopId("A"), lineId: lineId("2"), at: lisbon(THURSDAY, "08:31", "10") },
      { rideId: first.rideId, choice: "conferir" },
    );
    expect(result.ok).toBe(true);
    expect((await obsOf(f, first.observationId)).reviewDismissedAt).toBeNull();
    // A anterior fechou sem descida, como o board.
    const prev = await rideOf(f, first.rideId);
    expect([prev.status, prev.alightingObservationId]).toEqual(["closed", null]);
  });
});
