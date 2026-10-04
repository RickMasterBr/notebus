/// <reference types="node" />
// Dados inventados (D-091); a rede está em `registroFixture.ts`. Quinta 08/10/2026, hora de verão (UTC+1).
// Cada teste traz o valor esperado calculado à mão no comentário.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { type Fixture, THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";
import { rideMinutes } from "./registro";

const obsOf = async (f: Fixture, id: string) => (await selectLive(f.db, observation, eq(observation.id, id)))[0]!;
const rideOf = async (f: Fixture, id: string) => (await selectLive(f.db, ride, eq(ride.id, id)))[0]!;
const deductionColumns = (o: Awaited<ReturnType<typeof obsOf>>) => ({
  serviceDate: o.serviceDate,
  serviceMinute: o.serviceMinute,
  patternStopId: o.patternStopId,
  tripId: o.tripId,
  matchStatus: o.matchStatus,
  deviationMin: o.deviationMin,
  matchRuleVersion: o.matchRuleVersion,
});

/** Embarque na Arrabalde (pos. 2 da L1), na viagem das 08:10 (base 492 = 08:12). */
const boardAtA = (f: Fixture, hhmm = "08:12", ss = "30") =>
  f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, hhmm, ss) });

describe("registrar: o fato", () => {
  it("grava o fato com o mesmo instante (com segundos), embarquei, ao vivo, e um ride novo aberto", async () => {
    const f = await fixture();
    const at = lisbon(THURSDAY, "08:12", "30");
    const token = await boardAtA(f);
    const o = await obsOf(f, token.observationId);
    // observed_at = recorded_at = 08:12:30 (com os 30 s); kind boarded; mode live; sem localização.
    expect([o.observedAt, o.recordedAt, o.kind, o.mode, o.stopId, o.lineId]).toEqual([at, at, "boarded", "live", stopId("A"), lineId("1")]);
    expect([o.gpsLat, o.gpsLon, o.gpsAccuracyM, o.source]).toEqual([null, null, null, "user"]);
    expect(at % 60_000).toBe(30_000);
    const r = await rideOf(f, token.rideId);
    expect([r.status, r.boardingObservationId, r.alightingObservationId, o.rideId]).toEqual(["open", o.id, null, r.id]);
    // Antes da dedução, as colunas dela estão vazias.
    expect(deductionColumns(o)).toEqual({ serviceDate: null, serviceMinute: null, patternStopId: null, tripId: null, matchStatus: null, deviationMin: null, matchRuleVersion: null });
  });

  it("dedução: 08:12:30 na Arrabalde casa com a viagem das 08:10, desvio +0,5, auto", async () => {
    const f = await fixture();
    const token = await boardAtA(f);
    expect(await f.registro.refreshDeductions(Date.now())).toEqual({ done: 1, failed: 0 });
    const o = await obsOf(f, token.observationId);
    const trip = tripIdOf("1", "0810");
    // Base da pos. 2 = 492 (08:12). Observado = 492,5 → desvio +0,5. Minuto de serviço cheio = 492 (a coluna é inteira).
    expect(deductionColumns(o)).toEqual({
      serviceDate: THURSDAY,
      serviceMinute: 492,
      patternStopId: f.data.patternStopIds.get(`${f.data.trips.find((t) => t.id === trip)!.patternId}:2`),
      tripId: trip,
      matchStatus: "auto",
      deviationMin: 0.5,
      matchRuleVersion: 1,
    });
    expect((await rideOf(f, token.rideId)).tripId).toBe(trip);
  });

  it("um registro sem passagem (orphan) fica orphan, sem viagem no ride, e não vira estatística", async () => {
    const f = await fixture();
    // 08:50 na Arrabalde: a viagem das 08:40 passa às 08:42 (522): +8 casa; para ficar órfão, 09:30 (570): longe das duas.
    const token = await f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "09:30") });
    await f.registro.refreshDeductions(Date.now());
    const o = await obsOf(f, token.observationId);
    expect([o.matchStatus, o.tripId, o.deviationMin, o.patternStopId]).toEqual(["orphan", null, null, null]);
    expect((await rideOf(f, token.rideId)).tripId).toBeNull();
  });
});

describe("T-26 (banco): ride aberto e novo embarque", () => {
  it("o anterior fecha sem descida na mesma transação; Desfazer do novo reabre o anterior", async () => {
    const f = await fixture();
    const first = await boardAtA(f, "08:12", "00");
    const second = await f.registro.board({ stopId: stopId("A"), lineId: lineId("2"), at: lisbon(THURSDAY, "08:31") });
    const a = await rideOf(f, first.rideId);
    // O primeiro fechou, sem descida; o segundo é o único aberto.
    expect([a.status, a.alightingObservationId]).toEqual(["closed", null]);
    expect((await rideOf(f, second.rideId)).status).toBe("open");
    expect(second.reopenedRideIds).toEqual([first.rideId]);

    await f.registro.undoBoard(second, lisbon(THURSDAY, "08:31", "05"));
    // O novo foi apagado (registro e ride) e o anterior voltou a aberto.
    expect((await selectLive(f.db, observation, eq(observation.id, second.observationId))).length).toBe(0);
    expect((await selectLive(f.db, ride, eq(ride.id, second.rideId))).length).toBe(0);
    expect((await rideOf(f, first.rideId)).status).toBe("open");
  });

  it("Desfazer de um embarque que não fechou nada não reabre nem apaga outro ride", async () => {
    const f = await fixture();
    const only = await boardAtA(f);
    expect(only.reopenedRideIds).toEqual([]);
    await f.registro.undoBoard(only, lisbon(THURSDAY, "08:13"));
    expect((await selectLive(f.db, ride)).length).toBe(0);
  });
});

describe("falha ao gravar o fato", () => {
  it("o erro chega a quem chamou (vira toast de erro) e a transação desfaz tudo: o ride aberto não fecha", async () => {
    // Ids fixos: o segundo embarque bate na chave primária do primeiro e a gravação falha no meio da transação.
    const f = await fixture({ newId: () => "00000000-0000-7000-8000-000000000001" });
    const first = await boardAtA(f, "08:12", "00");
    await expect(boardAtA(f, "08:12", "30")).rejects.toThrow();
    // O `update` que fechava o ride anterior foi desfeito junto: continua aberto, e só há 1 registro.
    expect((await rideOf(f, first.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation)).length).toBe(1);
    // A fila não ficou travada: uma gravação seguinte funciona.
    await expect(f.registro.dismiss(first.rideId, lisbon(THURSDAY, "08:13"))).resolves.toBeUndefined();
  });
});

describe("T-22 (banco): falha na dedução", () => {
  it("o fato e o ride ficam no banco; a dedução é refeita na abertura seguinte e fica igual à de um registro sem falha", async () => {
    let failing = true;
    const f = await fixture({
      deduce: async (fact, network, ongoing) => {
        if (failing) throw new Error("falha forçada no cálculo");
        const { deduceObservation } = await import("@notebus/domain");
        return deduceObservation(fact, network, ongoing);
      },
    });
    const token = await boardAtA(f);
    const first = await f.registro.refreshDeductions(Date.now());
    // A passada falhou, mas nada se perdeu: fato e ride no banco, dedução vazia.
    expect(first).toEqual({ done: 0, failed: 1 });
    const kept = await obsOf(f, token.observationId);
    expect([kept.kind, kept.stopId, kept.observedAt, kept.matchRuleVersion, kept.matchStatus]).toEqual(["boarded", stopId("A"), lisbon(THURSDAY, "08:12", "30"), null, null]);
    expect((await rideOf(f, token.rideId)).status).toBe("open");

    // "Abertura seguinte": o cálculo funciona e a fila refaz.
    failing = false;
    expect(await f.registro.refreshDeductions(Date.now())).toEqual({ done: 1, failed: 0 });

    // Referência: o mesmo registro num banco em que nunca falhou.
    const clean = await fixture();
    const ref = await boardAtA(clean);
    await clean.registro.refreshDeductions(Date.now());
    expect(deductionColumns(await obsOf(f, token.observationId))).toEqual(deductionColumns(await obsOf(clean, ref.observationId)));
  });

  it("registro com a dedução já em dia não é refeito; manual nunca é recalculado (D-085)", async () => {
    const f = await fixture();
    const token = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    expect(await f.registro.refreshDeductions(Date.now())).toEqual({ done: 0, failed: 0 });
    // Versão velha volta para a fila…
    await f.db.update(observation).set({ matchRuleVersion: 0 }).where(eq(observation.id, token.observationId));
    expect((await f.registro.refreshDeductions(Date.now())).done).toBe(1);
    // …mas um vínculo manual, mesmo com versão velha, fica como está.
    await f.db.update(observation).set({ matchRuleVersion: 0, matchStatus: "manual", deviationMin: 9 }).where(eq(observation.id, token.observationId));
    expect(await f.registro.refreshDeductions(Date.now())).toEqual({ done: 0, failed: 0 });
    expect((await obsOf(f, token.observationId)).deviationMin).toBe(9);
  });

  it("sem os horários carregados a dedução espera, sem erro", async () => {
    const f = await fixture({ network: () => null });
    await boardAtA(f);
    expect(await f.registro.refreshDeductions(Date.now())).toEqual({ done: 0, failed: 0 });
  });
});

describe("velocidade: o toque não espera a dedução", () => {
  it("com a dedução lenta, o fato já está gravado quando o embarque responde", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const f = await fixture({
      deduce: async (fact, network, ongoing) => {
        await gate;
        const { deduceObservation } = await import("@notebus/domain");
        return deduceObservation(fact, network, ongoing);
      },
    });
    const token = await boardAtA(f); // é o que o toast espera
    const deduction = f.registro.refreshDeductions(Date.now()); // a dedução foi pedida e está presa no `gate`
    const before = await obsOf(f, token.observationId);
    // O fato está no banco e a dedução ainda não terminou.
    expect([before.kind, before.matchRuleVersion]).toEqual(["boarded", null]);
    release();
    expect(await deduction).toEqual({ done: 1, failed: 0 });
    expect((await obsOf(f, token.observationId)).matchStatus).toBe("auto");
  });
});

describe("descida", () => {
  it("08:12:30 → 08:47:00 no Campus: alighted no mesmo ride, ride closed, viagem de 35 min", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const pattern = f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;
    const at = lisbon(THURSDAY, "08:47", "00");
    const result = await f.registro.alight({ rideId: board.rideId, stopId: stopId("K"), patternId: pattern, position: 5, at });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 08:47:00 − 08:12:30 = 34,5 min; meio minuto sobe (mesma regra do `displayCenter`, D-092) → 35.
    expect(result.minutes).toBe(35);
    expect(rideMinutes(lisbon(THURSDAY, "08:12", "30"), at)).toBe(35);
    const a = await obsOf(f, result.token.observationId);
    const r = await rideOf(f, board.rideId);
    expect([a.kind, a.rideId, a.stopId, a.lineId, a.observedAt]).toEqual(["alighted", board.rideId, stopId("K"), lineId("1"), at]);
    expect([r.status, r.alightingObservationId]).toEqual(["closed", a.id]);

    // A dedução da descida respeita a viagem em curso (D-071): casa com a viagem das 08:10, pos. 5 (524 = 08:44, +3).
    await f.registro.refreshDeductions(Date.now());
    const deduced = await obsOf(f, a.id);
    expect([deduced.matchStatus, deduced.tripId, deduced.deviationMin]).toEqual(["auto", tripIdOf("1", "0810"), 3]);
  });

  it("descida em posição menor ou igual à do embarque é recusada (invariante 5) e nada é gravado", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const pattern = f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;
    for (const position of [1, 2]) {
      const result = await f.registro.alight({ rideId: board.rideId, stopId: stopId("A"), patternId: pattern, position, at: lisbon(THURSDAY, "08:40") });
      expect(result).toEqual({ ok: false, problem: expect.stringContaining("invariante 5") });
    }
    expect((await rideOf(f, board.rideId)).status).toBe("open");
    expect((await selectLive(f.db, observation)).length).toBe(1);
  });

  it("descida antes da hora do embarque é recusada", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const pattern = f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;
    const result = await f.registro.alight({ rideId: board.rideId, stopId: stopId("K"), patternId: pattern, position: 5, at: lisbon(THURSDAY, "08:00") });
    expect(result).toEqual({ ok: false, problem: expect.stringContaining("descida antes do embarque") });
  });

  it("Desfazer a descida: apaga o alighted e o ride volta a aberto", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    const pattern = f.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!.patternId;
    const result = await f.registro.alight({ rideId: board.rideId, stopId: stopId("K"), patternId: pattern, position: 5, at: lisbon(THURSDAY, "08:47") });
    if (!result.ok) throw new Error(result.problem);
    await f.registro.undoAlight(result.token, lisbon(THURSDAY, "08:47", "05"));
    const r = await rideOf(f, board.rideId);
    expect([r.status, r.alightingObservationId]).toEqual(["open", null]);
    expect((await selectLive(f.db, observation, eq(observation.id, result.token.observationId))).length).toBe(0);
  });
});

describe("Não embarquei e Dispensar", () => {
  it("Não embarquei: kind passed e ride dismissed; Desfazer volta a boarded e open", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.notBoarded(board.rideId, lisbon(THURSDAY, "08:13"));
    expect([(await obsOf(f, board.observationId)).kind, (await rideOf(f, board.rideId)).status]).toEqual(["passed", "dismissed"]);
    await f.registro.undoNotBoarded(board.rideId, lisbon(THURSDAY, "08:13", "04"));
    expect([(await obsOf(f, board.observationId)).kind, (await rideOf(f, board.rideId)).status]).toEqual(["boarded", "open"]);
  });

  it("Dispensar: ride closed sem descida; Desfazer volta a open", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.dismiss(board.rideId, lisbon(THURSDAY, "08:14"));
    const r = await rideOf(f, board.rideId);
    expect([r.status, r.alightingObservationId]).toEqual(["closed", null]);
    await f.registro.undoDismiss(board.rideId, lisbon(THURSDAY, "08:14", "04"));
    expect((await rideOf(f, board.rideId)).status).toBe("open");
  });

  it("Não embarquei e Dispensar num ride que já fechou: recusados, sem alterar nada", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.dismiss(board.rideId, lisbon(THURSDAY, "08:14"));
    await expect(f.registro.notBoarded(board.rideId, lisbon(THURSDAY, "08:15"))).rejects.toThrow(/só com o ride aberto/);
    await expect(f.registro.dismiss(board.rideId, lisbon(THURSDAY, "08:15"))).rejects.toThrow(/só com o ride aberto/);
    expect((await obsOf(f, board.observationId)).kind).toBe("boarded");
  });
});

describe("fechamento automático", () => {
  it("a viagem das 08:10 termina às 09:05 (545); com +30 min (Q-82) o ride fecha depois das 09:35", async () => {
    const f = await fixture();
    const board = await boardAtA(f);
    await f.registro.refreshDeductions(Date.now());
    // Fim = 545 (09:05) + 30 = 575 (09:35). `rideExpired` compara o minuto inteiro com `>`: 09:35:59 é o minuto 575 (aberto);
    // 09:36:00 é o 576 (fecha). Com a folga antiga (+15) já teria fechado às 09:21.
    expect(await f.registro.expire(lisbon(THURSDAY, "09:21", "00"))).toBe(0);
    expect(await f.registro.expire(lisbon(THURSDAY, "09:35", "59"))).toBe(0);
    expect((await rideOf(f, board.rideId)).status).toBe("open");
    expect(await f.registro.expire(lisbon(THURSDAY, "09:36", "00"))).toBe(1);
    const r = await rideOf(f, board.rideId);
    // Fechou sem descida e sem tocar no registro.
    expect([r.status, r.alightingObservationId, (await obsOf(f, board.observationId)).kind]).toEqual(["closed", null, "boarded"]);
  });

  it("Q-85: um ride sem viagem conhecida (a linha não passa no ponto) fecha 3 h depois do embarque", async () => {
    const f = await fixture();
    // A linha 2 não passa na Estação: sem viagem, sem fim para contar. Embarque 08:12 → 11:12 aberto, 11:13 fecha.
    const board = await f.registro.board({ stopId: stopId("S"), lineId: lineId("2"), at: lisbon(THURSDAY, "08:12") });
    expect(await f.registro.expire(lisbon(THURSDAY, "11:12"))).toBe(0);
    expect((await rideOf(f, board.rideId)).status).toBe("open");
    expect(await f.registro.expire(lisbon(THURSDAY, "11:13"))).toBe(1);
    expect((await rideOf(f, board.rideId)).status).toBe("closed");
  });
});

describe("fila: gravações em série", () => {
  it("dois toques seguidos não se misturam: o primeiro ride fecha e só o segundo fica aberto", async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([boardAtA(f, "08:12", "00"), boardAtA(f, "08:12", "10")]);
    const rides = await selectLive(f.db, ride);
    expect(rides.filter((r) => r.status === "open").map((r) => r.id)).toEqual([b.rideId]);
    expect(rides.find((r) => r.id === a.rideId)!.status).toBe("closed");
  });
});
