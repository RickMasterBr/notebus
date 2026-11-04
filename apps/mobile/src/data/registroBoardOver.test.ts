/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// Embarque novo com a viagem aberta escolhida pelo usuário (D-403, ideia 239): a gravação e o Desfazer.
// Cada teste traz o valor esperado calculado à mão no comentário.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { type Fixture, THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";

const obsOf = async (f: Fixture, id: string) => (await selectLive(f.db, observation, eq(observation.id, id)))[0]!;
const rideOf = async (f: Fixture, id: string) => (await selectLive(f.db, ride, eq(ride.id, id)))[0]!;

/** Embarque na Arrabalde (pos. 2 da L1), na viagem das 08:10 (base 492 = 08:12). */
const boardAtA = (f: Fixture, hhmm = "08:12", ss = "30") =>
  f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, hhmm, ss) });

/** O padrão da L1 (viagem das 08:10: pos. 2 = Arrabalde, pos. 5 = Campus). */
const l1Pattern = (f: Fixture) => f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;

describe("embarque novo com a viagem aberta (D-403)", () => {
  it("conferir: fecha a anterior sem descida, como o board; Desfazer reabre a anterior", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "00");
    const at = lisbon(THURSDAY, "08:31", "10");
    const result = await f.registro.boardOver(
      { stopId: stopId("A"), lineId: lineId("2"), at },
      { rideId: first.rideId, choice: "conferir" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A anterior fechou sem descida; o embarque novo entrou com a hora do toque e a viagem nova está aberta.
    const a = await rideOf(f, first.rideId);
    expect([a.status, a.alightingObservationId]).toEqual(["closed", null]);
    const n = await obsOf(f, result.token.observationId);
    expect([n.observedAt, n.recordedAt, n.kind, n.stopId, n.lineId]).toEqual([at, at, "boarded", stopId("A"), lineId("2")]);
    expect((await rideOf(f, result.token.rideId)).status).toBe("open");
    expect(result.token.reopenedRideIds).toEqual([first.rideId]);
    expect(result.token.previous).toEqual({ rideId: first.rideId, choice: "conferir" });

    await f.registro.undoBoardOver(result.token, lisbon(THURSDAY, "08:31", "20"));
    // O novo foi apagado e a anterior voltou a aberta, como no Desfazer do board (T-26).
    expect((await selectLive(f.db, observation, eq(observation.id, result.token.observationId))).length).toBe(0);
    expect((await selectLive(f.db, ride, eq(ride.id, result.token.rideId))).length).toBe(0);
    expect((await rideOf(f, first.rideId)).status).toBe("open");
  });

  it("dispensar: apaga o embarque e a viagem anteriores; Desfazer os restaura com a viagem aberta", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "08:31", "10");
    const result = await f.registro.boardOver(
      { stopId: stopId("A"), lineId: lineId("2"), at },
      { rideId: first.rideId, choice: "dispensar" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token.previous).toEqual({ rideId: first.rideId, choice: "dispensar" });
    // O embarque e a viagem anteriores sumiram do banco vivo; o novo está aberto.
    expect((await selectLive(f.db, observation, eq(observation.id, first.observationId))).length).toBe(0);
    expect((await selectLive(f.db, ride, eq(ride.id, first.rideId))).length).toBe(0);
    expect((await obsOf(f, result.token.observationId)).kind).toBe("boarded");
    expect((await rideOf(f, result.token.rideId)).status).toBe("open");

    await f.registro.undoBoardOver(result.token, lisbon(THURSDAY, "08:31", "20"));
    // A anterior volta viva e aberta; a nova some.
    const back = await obsOf(f, first.observationId);
    expect([back.kind, back.deletedAt]).toEqual(["boarded", null]);
    const backRide = await rideOf(f, first.rideId);
    expect([backRide.status, backRide.deletedAt]).toEqual(["open", null]);
    expect((await selectLive(f.db, observation, eq(observation.id, result.token.observationId))).length).toBe(0);
    expect((await selectLive(f.db, ride, eq(ride.id, result.token.rideId))).length).toBe(0);
  });

  it("descida: grava a descida da anterior no Campus e o embarque novo, os dois com a hora do toque", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "08:47", "00");
    const result = await f.registro.boardOver(
      { stopId: stopId("A"), lineId: lineId("1"), at },
      { rideId: first.rideId, choice: "descida", stopId: stopId("K"), patternId: l1Pattern(f), position: 5 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const alightId = result.token.previous?.alightObservationId;
    expect(alightId).toBeDefined();
    if (!alightId) return;
    // A descida entra como o `alight`: alighted no Campus, no ride anterior, com a hora do toque.
    const a = await obsOf(f, alightId);
    expect([a.kind, a.stopId, a.lineId, a.rideId, a.observedAt, a.recordedAt]).toEqual(["alighted", stopId("K"), lineId("1"), first.rideId, at, at]);
    const prev = await rideOf(f, first.rideId);
    expect([prev.status, prev.alightingObservationId]).toEqual(["closed", alightId]);
    // O embarque novo usa a mesma hora do toque.
    const n = await obsOf(f, result.token.observationId);
    expect([n.observedAt, n.recordedAt, n.kind, n.stopId]).toEqual([at, at, "boarded", stopId("A")]);
    expect((await rideOf(f, result.token.rideId)).status).toBe("open");

    await f.registro.undoBoardOver(result.token, lisbon(THURSDAY, "08:47", "30"));
    // Undo da descida (como o `undoAlight`) e do embarque novo: a anterior volta aberta, sem descida.
    expect((await selectLive(f.db, observation, eq(observation.id, alightId))).length).toBe(0);
    const back = await rideOf(f, first.rideId);
    expect([back.status, back.alightingObservationId]).toEqual(["open", null]);
    expect((await selectLive(f.db, observation, eq(observation.id, result.token.observationId))).length).toBe(0);
    expect((await selectLive(f.db, ride, eq(ride.id, result.token.rideId))).length).toBe(0);
  });

  it("descida em posição que não vem depois do embarque (invariante 5) é recusada e nada é gravado", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    await f.registro.refreshDeductions(Date.now());
    const at = lisbon(THURSDAY, "08:47");
    for (const position of [1, 2]) {
      const result = await f.registro.boardOver(
        { stopId: stopId("A"), lineId: lineId("1"), at },
        { rideId: first.rideId, choice: "descida", stopId: stopId("A"), patternId: l1Pattern(f), position },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problem).toContain("invariante 5");
    }
    expect((await rideOf(f, first.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation)).length).toBe(1);
    expect((await selectLive(f.db, ride)).length).toBe(1);
  });

  it("descida antes da hora do embarque é recusada e nada é gravado", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    await f.registro.refreshDeductions(Date.now());
    const result = await f.registro.boardOver(
      { stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:00") },
      { rideId: first.rideId, choice: "descida", stopId: stopId("K"), patternId: l1Pattern(f), position: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain("descida antes do embarque");
    expect((await rideOf(f, first.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation)).length).toBe(1);
  });

  it("viagem anterior inexistente ou já fechada: recusado com o problema e nada gravado", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    const at = lisbon(THURSDAY, "08:31", "10");
    const input = { stopId: stopId("A"), lineId: lineId("2"), at };
    expect(await f.registro.boardOver(input, { rideId: "não-existe", choice: "conferir" })).toEqual({
      ok: false,
      problem: "viagem não encontrada",
    });
    await f.registro.dismiss(first.rideId, at);
    expect(await f.registro.boardOver(input, { rideId: first.rideId, choice: "conferir" })).toEqual({
      ok: false,
      problem: "viagem não encontrada",
    });
    expect((await selectLive(f.db, observation)).length).toBe(1);
    expect((await selectLive(f.db, ride)).length).toBe(1);
    expect((await rideOf(f, first.rideId)).status).toBe("closed");
  });

  it("falha no meio da gravação desfaz tudo (a anterior continua aberta) e a fila não trava", async () => {
    // Ids fixos: o embarque novo bate na chave primária da viagem anterior e a gravação falha no meio da transação.
    const f = await fixture({ newId: () => "00000000-0000-7000-8000-000000000001" });
    const first = await boardAtA(f, "08:12", "00");
    const at = lisbon(THURSDAY, "08:31", "10");
    await expect(
      f.registro.boardOver({ stopId: stopId("A"), lineId: lineId("2"), at }, { rideId: first.rideId, choice: "conferir" }),
    ).rejects.toThrow();
    // O fecho da anterior foi desfeito junto: continua aberta e só há 1 registro.
    expect((await rideOf(f, first.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation)).length).toBe(1);
    // A fila não ficou travada.
    await expect(f.registro.dismiss(first.rideId, lisbon(THURSDAY, "08:32"))).resolves.toBeUndefined();
  });

  it("sem viagem anterior grava como o board, e o Desfazer reabre o que ele fechou", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "30");
    const at = lisbon(THURSDAY, "08:31", "10");
    const result = await f.registro.boardOver({ stopId: stopId("A"), lineId: lineId("2"), at }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token.previous).toBeNull();
    expect(result.token.reopenedRideIds).toEqual([first.rideId]);
    const n = await obsOf(f, result.token.observationId);
    expect([n.observedAt, n.recordedAt, n.kind]).toEqual([at, at, "boarded"]);
    expect((await rideOf(f, first.rideId)).status).toBe("closed");
    expect((await rideOf(f, result.token.rideId)).status).toBe("open");

    await f.registro.undoBoardOver(result.token, lisbon(THURSDAY, "08:31", "20"));
    expect((await rideOf(f, first.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation, eq(observation.id, result.token.observationId))).length).toBe(0);
  });
});
