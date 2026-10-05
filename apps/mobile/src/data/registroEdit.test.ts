/// <reference types="node" />
// E-04 bloco 1: editar, escolher, "não sei", apagar e mudar o tipo, pela camada de dados. Rede inventada (D-091), quinta
// 08/10/2026, hora de verão (UTC+1). A L1 passa na Arrabalde (pos. 2) às 08:12 e às 08:42; no Campus (pos. 5) às 08:44 e
// às 09:14. A L2 passa na Arrabalde às 08:30. A L3 passa na Arrabalde duas vezes: 08:20 (pos. 1) e 08:26 (pos. 3).
// Cada teste traz o valor esperado calculado à mão no comentário.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { intervalAround, previewMatch, verifyOptions } from "@notebus/domain";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { passageRecords, matchNetworkOf } from "./records";
import { reviewQueue, notVerified } from "./review";
import { type Fixture, THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "./registroFixture";
import { factOf } from "./rideView";

const obsOf = async (f: Fixture, id: string) => (await selectLive(f.db, observation, eq(observation.id, id)))[0]!;
const rideOf = async (f: Fixture, id: string) => (await selectLive(f.db, ride, eq(ride.id, id)))[0]!;
const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
const allRows = async (f: Fixture) => ({ obs: byId(await selectLive(f.db, observation)), rides: byId(await selectLive(f.db, ride)) });
const noUpdatedAt = <T extends { updatedAt: number }>(list: T[]) => list.map(({ updatedAt: _ignored, ...rest }) => rest);
const deduction = (o: Awaited<ReturnType<typeof obsOf>>) => ({
  matchStatus: o.matchStatus,
  tripId: o.tripId,
  deviationMin: o.deviationMin,
  patternStopId: o.patternStopId,
  matchRuleVersion: o.matchRuleVersion,
});

const T0810 = tripIdOf("1", "0810");
const T0840 = tripIdOf("1", "0840");
const NOW = lisbon(THURSDAY, "10:00"); // "agora" das edições: depois de todos os registros dos testes
const LATER = lisbon(THURSDAY, "10:05");

/** Embarque na Arrabalde (L1) e dedução feita. */
async function boardL1(f: Fixture, hhmm: string, ss = "00") {
  const token = await f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, hhmm, ss) });
  await f.registro.refreshDeductions(NOW);
  return token;
}

/** A N3 do plano, em miniatura: L1 na Arrabalde às 08:30 não casa (08:12 → +18; 08:42 → −12). */
const boardOrphan = (f: Fixture) => boardL1(f, "08:30");

describe("T-33: casamento em rascunho não grava nada", () => {
  it("08:13 → viagem das 08:10 +1; 08:11 → −1; 08:08 → −4; 08:03 → órfã (−9); as linhas do banco ficam idênticas", async () => {
    const f = await fixture();
    await boardL1(f, "08:13");
    const before = await allRows(f);
    const network = matchNetworkOf(f.data);
    const draft = (hhmm: string) => ({ stopId: stopId("A"), lineId: lineId("1"), observedAt: lisbon(THURSDAY, hhmm), observedEndAt: null });
    // Base da viagem das 08:10 na pos. 2 = 492 (08:12).
    const seen = ["08:13", "08:11", "08:08"].map((h) => {
      const p = previewMatch(draft(h), network);
      return [p.status, p.chosen!.tripId, p.chosen!.deviation, p.departureMinute];
    });
    expect(seen).toEqual([["auto", T0810, 1, 490], ["auto", T0810, -1, 490], ["auto", T0810, -4, 490]]);
    // 08:03 = 483 − 492 = −9 (adiantado demais); a das 08:40 (522) daria −39.
    const orphan = previewMatch(draft("08:03"), network);
    expect([orphan.status, orphan.nearest!.tripId, orphan.nearest!.deviation]).toEqual(["orphan", T0810, -9]);
    expect(await allRows(f)).toEqual(before);
  });
});

describe("T-34: a escolha manual e a edição da hora (D-097)", () => {
  it("(a) nova versão da regra não mexe; (b) mudar a hora derruba a escolha e recalcula; (c) Desfazer a devolve", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    const chosen = await f.registro.chooseManual(b.observationId, { tripId: T0810, position: 2, serviceDate: THURSDAY }, NOW);
    expect(chosen.ok).toBe(true);
    const manual = await obsOf(f, b.observationId);
    // 08:30 = 510 menos a base 492 = +18, como é.
    expect([manual.matchStatus, manual.tripId, manual.deviationMin, manual.serviceDate, manual.serviceMinute]).toEqual(["manual", T0810, 18, THURSDAY, 510]);
    expect((await rideOf(f, b.rideId)).tripId).toBe(T0810);

    // (a) a regra "envelhece" (versão antiga na linha) e a fila roda: o `manual` não se recalcula (D-085).
    await f.raw.run("UPDATE observation SET match_rule_version = 0 WHERE id = ?", [b.observationId]);
    expect(await f.registro.refreshDeductions(NOW)).toEqual({ done: 0, failed: 0 });
    expect(deduction(await obsOf(f, b.observationId))).toMatchObject({ matchStatus: "manual", tripId: T0810, deviationMin: 18 });

    // (b) 08:13 = 493 − 492 = +1: a escolha cai e o registro vira `auto`.
    const edited = await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "08:13") }, NOW);
    expect([edited.changed, edited.rejected]).toEqual([true, []]);
    const after = await obsOf(f, b.observationId);
    expect([after.matchStatus, after.tripId, after.deviationMin, after.matchRuleVersion, after.mode]).toEqual(["auto", T0810, 1, 1, "later"]);

    // (c) Desfazer logo depois: volta o `manual`, a mesma viagem, +18 e a hora de antes, com `updated_at` novo.
    await f.registro.restore(edited.token!, LATER);
    const back = await obsOf(f, b.observationId);
    expect([back.matchStatus, back.tripId, back.deviationMin, back.observedAt, back.mode, back.updatedAt]).toEqual(["manual", T0810, 18, lisbon(THURSDAY, "08:30"), "live", LATER]);
    expect((await rideOf(f, b.rideId)).tripId).toBe(T0810);
  });

  it("D-097, o que NÃO derruba a escolha: nota, memória e tipo", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    await f.registro.chooseManual(b.observationId, { tripId: T0810, position: 2, serviceDate: THURSDAY }, NOW);
    const chosen = deduction(await obsOf(f, b.observationId));
    const note = await f.registro.edit(b.observationId, { note: "o motorista era novo" }, NOW);
    const memory = await f.registro.edit(b.observationId, { memory: true }, NOW);
    const kind = await f.registro.edit(b.observationId, { kind: "passed" }, NOW);
    expect([note.changed, memory.changed, kind.changed]).toEqual([true, true, true]);
    const o = await obsOf(f, b.observationId);
    expect([o.note, o.mode, o.kind]).toEqual(["o motorista era novo", "memory", "passed"]);
    expect(deduction(o)).toEqual(chosen); // ainda `manual`, a mesma viagem e +18
    // A fila (mesmo com a regra velha) não muda o `match_status` de um `manual` com a nota editada.
    await f.raw.run("UPDATE observation SET match_rule_version = 0 WHERE id = ?", [b.observationId]);
    await f.registro.refreshDeductions(NOW);
    expect((await obsOf(f, b.observationId)).matchStatus).toBe("manual");
  });
});

describe("T-35, T-36 e T-37: as opções da TL-09 vindas do banco", () => {
  it("T-35: órfã na L1 às 08:30 → L1 08:12 (+18; 1,20), L1 08:42 (−12; 2,40); outras linhas: L2 08:30 (0), L3 08:26 (+4)", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    const o = verifyOptions(factOf(await obsOf(f, b.observationId)), matchNetworkOf(f.data));
    expect(o.status).toBe("orphan");
    expect(o.sameLine.map((p) => [p.tripId, p.position, p.deviation, p.distance])).toEqual([[T0810, 2, 18, 1.2], [T0840, 2, -12, 2.4]]);
    // L2: pos. 1 às 08:30 → 0, distância 0. L3: pos. 3 às 08:26 → +4 → 0,267; a pos. 1 (08:20, +10) é mais longe e não entra.
    expect(o.otherLines.map((p) => [p.lineId, p.position, p.deviation])).toEqual([[lineId("2"), 1, 0], [lineId("3"), 3, 4]]);
    expect(o.candidates).toEqual([]);
  });

  it("T-36: ambígua na L3 às 08:23 → duas passagens do mesmo ponto, com número, origem e destino", async () => {
    const f = await fixture();
    const token = await f.registro.board({ stopId: stopId("A"), lineId: lineId("3"), at: lisbon(THURSDAY, "08:23") });
    await f.registro.refreshDeductions(NOW);
    const row = await obsOf(f, token.observationId);
    // pos. 1 às 08:20 (+3; 0,20) e pos. 3 às 08:26 (−3; 0,60): as duas dentro de −5/+15.
    expect(row.matchStatus).toBe("ambiguous");
    const o = verifyOptions(factOf(row), matchNetworkOf(f.data));
    // Pontos de controle da L3: 1, 2 (marcado), 3 (com horário) e 4. Pos. 1: 1ª, destino 2. Pos. 3: 2ª, origem 2, destino 4.
    expect(o.candidates.map((p) => [p.position, p.deviation, p.info.number, p.info.origin, p.info.destination])).toEqual([
      [1, 3, 1, null, 2],
      [3, -3, 2, 2, 4],
    ]);
    expect(o.sameLine).toEqual([]);
    // Escolher a 2ª passagem: manual, desvio −3.
    const tripL3 = tripIdOf("3", "0800");
    expect((await f.registro.chooseManual(token.observationId, { tripId: tripL3, position: 3, serviceDate: THURSDAY }, NOW)).ok).toBe(true);
    expect(deduction(await obsOf(f, token.observationId))).toMatchObject({ matchStatus: "manual", tripId: tripL3, deviationMin: -3 });
  });

  it("T-37: a descida casou com a viagem das 08:40 → ela vem primeiro, com a pista; o registro segue órfão até a escolha", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    const trip = f.data.trips.find((t) => t.id === T0810)!;
    const down = await f.registro.alight({ rideId: b.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "09:12") });
    expect(down.ok).toBe(true);
    await f.registro.refreshDeductions(NOW);
    // 09:12 = 552 no Campus: a das 08:40 passa às 09:14 (554) → −2, casa; a das 08:10 (524) daria +28.
    const alightRow = await obsOf(f, (down as { token: { observationId: string } }).token.observationId);
    expect([alightRow.matchStatus, alightRow.tripId, alightRow.deviationMin]).toEqual(["auto", T0840, -2]);
    const row = await obsOf(f, b.observationId);
    const o = verifyOptions(factOf(row), matchNetworkOf(f.data), {
      alight: { tripId: alightRow.tripId, matchStatus: alightRow.matchStatus, stopId: alightRow.stopId, observedAt: alightRow.observedAt },
    });
    expect(o.sameLine.map((p) => p.tripId)).toEqual([T0840, T0810]);
    expect(o.sameLine[0]!.alightHint).toEqual({ stopId: stopId("K"), observedAt: lisbon(THURSDAY, "09:12") });
    expect(o.sameLine[1]!.alightHint).toBeNull();
    expect((await obsOf(f, b.observationId)).matchStatus).toBe("orphan"); // nunca vira `manual` sozinha
    // Escolher a viagem da descida vale (mesmo percurso, posição 2 < 5, hora ≥).
    expect((await f.registro.chooseManual(b.observationId, { tripId: T0840, position: 2, serviceDate: THURSDAY }, NOW)).ok).toBe(true);
  });

  it("escolher outra linha muda o fato (`line_id`); com descida ligada, é recusado", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    // A L2 passa na Arrabalde às 08:30 (pos. 1): desvio 0.
    const tripL2 = tripIdOf("2", "0830");
    const done = await f.registro.chooseManual(b.observationId, { tripId: tripL2, position: 1, serviceDate: THURSDAY, lineId: lineId("2") }, NOW);
    expect(done.ok).toBe(true);
    const o = await obsOf(f, b.observationId);
    expect([o.lineId, o.matchStatus, o.tripId, o.deviationMin]).toEqual([lineId("2"), "manual", tripL2, 0]);
    expect((await rideOf(f, b.rideId)).tripId).toBe(tripL2);

    const g = await fixture();
    const c = await boardOrphan(g);
    const trip = g.data.trips.find((t) => t.id === T0810)!;
    await g.registro.alight({ rideId: c.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "09:12") });
    await g.registro.refreshDeductions(NOW);
    const before = await allRows(g);
    const refused = await g.registro.chooseManual(c.observationId, { tripId: tripL2, position: 1, serviceDate: THURSDAY, lineId: lineId("2") }, NOW);
    expect(refused).toEqual({ ok: false, problem: "alight_conflict" });
    expect(await allRows(g)).toEqual(before);
  });
});

describe("Não sei (D-057) e as filas", () => {
  it("dismissReview grava a marca; some da fila e vai para 'não conferido'; chooseManual e a hora a limpam", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    const second = await f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "09:30") });
    await f.registro.refreshDeductions(NOW);
    let { observations } = await f.registro.load();
    expect(reviewQueue(observations).map((o) => o.id)).toEqual([second.observationId, b.observationId]); // mais novo primeiro
    expect(notVerified(observations)).toEqual([]);

    const token = (await f.registro.dismissReview(b.observationId, LATER))!;
    const dismissed = await obsOf(f, b.observationId);
    expect([dismissed.reviewDismissedAt, dismissed.matchStatus]).toEqual([LATER, "orphan"]); // continua órfão
    ({ observations } = await f.registro.load());
    expect(reviewQueue(observations).map((o) => o.id)).toEqual([second.observationId]);
    expect(notVerified(observations).map((o) => o.id)).toEqual([b.observationId]);

    // Reabrir e escolher limpa a marca.
    await f.registro.chooseManual(b.observationId, { tripId: T0810, position: 2, serviceDate: THURSDAY }, LATER + 1);
    expect((await obsOf(f, b.observationId)).reviewDismissedAt).toBeNull();
    // Desfazer o "Não sei" de outro registro: volta sem a marca.
    const t2 = (await f.registro.dismissReview(second.observationId, LATER))!;
    await f.registro.restore(t2, LATER + 2);
    expect((await obsOf(f, second.observationId)).reviewDismissedAt).toBeNull();
    // Editar a hora também limpa a marca ("é outra pergunta").
    // Desfazer a escolha manual (token da própria escolha não existe aqui): "Não sei" de novo e depois a hora.
    await f.registro.restore(token, LATER + 3); // o token do "Não sei" devolve o registro como estava antes dele
    expect([(await obsOf(f, b.observationId)).reviewDismissedAt, (await obsOf(f, b.observationId)).matchStatus]).toEqual([null, "orphan"]);
    await f.registro.dismissReview(b.observationId, LATER + 4);
    expect((await obsOf(f, b.observationId)).reviewDismissedAt).toBe(LATER + 4);
    await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "08:31") }, NOW);
    expect((await obsOf(f, b.observationId)).reviewDismissedAt).toBeNull();
  });

  it("a fila nunca traz descida, apagado, auto nem manual", async () => {
    const f = await fixture();
    const base = { deletedAt: null, reviewDismissedAt: null };
    const rows = [
      { id: "orfa", kind: "boarded", matchStatus: "orphan", observedAt: 1, ...base },
      { id: "ambigua", kind: "passed", matchStatus: "ambiguous", observedAt: 2, ...base },
      { id: "desc", kind: "alighted", matchStatus: "orphan", observedAt: 3, ...base },
      { id: "auto", kind: "boarded", matchStatus: "auto", observedAt: 4, ...base },
      { id: "manual", kind: "boarded", matchStatus: "manual", observedAt: 5, ...base },
      { id: "apagada", kind: "boarded", matchStatus: "orphan", observedAt: 6, ...base, deletedAt: 9 },
      { id: "nao-sei", kind: "boarded", matchStatus: "orphan", observedAt: 7, ...base, reviewDismissedAt: 8 },
      { id: "nao-sei-desc", kind: "alighted", matchStatus: "orphan", observedAt: 8, ...base, reviewDismissedAt: 8 },
    ] as const;
    expect(reviewQueue(rows).map((o) => o.id)).toEqual(["ambigua", "orfa"]);
    expect(notVerified(rows).map((o) => o.id)).toEqual(["nao-sei"]);
    expect(f).toBeDefined();
  });
});

describe("D-022: o que entra na estimativa", () => {
  it("orphan e ambiguous ficam de fora; manual entra; apagar tira", async () => {
    const f = await fixture();
    const b = await boardOrphan(f);
    await f.registro.board({ stopId: stopId("A"), lineId: lineId("3"), at: lisbon(THURSDAY, "08:23") }); // ambígua
    await f.registro.refreshDeductions(NOW);
    let { observations } = await f.registro.load();
    expect(observations.map((o) => o.matchStatus).sort()).toEqual(["ambiguous", "orphan"]);
    expect(passageRecords(observations, f.data)).toEqual([]);

    await f.registro.chooseManual(b.observationId, { tripId: T0810, position: 2, serviceDate: THURSDAY }, NOW);
    ({ observations } = await f.registro.load());
    const records = passageRecords(observations, f.data);
    expect(records.map((r) => [r.matchStatus, r.deviation, r.tripId])).toEqual([["manual", 18, T0810]]);

    await f.registro.remove(b.observationId, LATER);
    ({ observations } = await f.registro.load());
    expect(passageRecords(observations, f.data)).toEqual([]);
    expect(reviewQueue(observations).map((o) => o.matchStatus)).toEqual(["ambiguous"]); // a apagada sai da fila também
  });
});

describe("editar: sem mudança, hora no futuro, intervalo e recorded_at", () => {
  it("sem mudança real não grava nada (nem updated_at) e devolve changed: false", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const before = await allRows(f);
    const same = await f.registro.edit(
      b.observationId,
      { observedAt: lisbon(THURSDAY, "08:12", "30"), observedEndAt: null, kind: "boarded", memory: false, note: null },
      NOW,
    );
    expect(same).toEqual({ changed: false, rejected: [], token: null });
    expect(await allRows(f)).toEqual(before);
  });

  it("hora no futuro é recusada e o resto grava; recorded_at nunca muda", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const recorded = (await obsOf(f, b.observationId)).recordedAt;
    const res = await f.registro.edit(b.observationId, { observedAt: NOW + 60_000, note: "ok" }, NOW);
    expect(res.changed).toBe(true);
    expect(res.rejected).toEqual([{ field: "observedAt", code: "future" }]);
    const o = await obsOf(f, b.observationId);
    expect([o.observedAt, o.note, o.recordedAt, o.mode]).toEqual([lisbon(THURSDAY, "08:12", "30"), "ok", recorded, "live"]);
    // Uma mudança de hora válida também deixa recorded_at como estava, e o modo vira "later" (D-055).
    await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "08:10") }, NOW);
    const moved = await obsOf(f, b.observationId);
    expect([moved.recordedAt, moved.mode]).toEqual([recorded, "later"]);
    // Voltar à hora do toque volta a ser "live"; a memória ligada vence sempre.
    await f.registro.edit(b.observationId, { observedAt: recorded }, NOW);
    expect((await obsOf(f, b.observationId)).mode).toBe("live");
    await f.registro.edit(b.observationId, { memory: true, observedAt: lisbon(THURSDAY, "08:10") }, NOW);
    expect((await obsOf(f, b.observationId)).mode).toBe("memory");
    await f.registro.edit(b.observationId, { memory: false }, NOW);
    expect((await obsOf(f, b.observationId)).mode).toBe("later");
  });

  it("T-40: mais ou menos ±10 dá 20 min e o casamento usa o ponto médio; intervalo maior que 30 min é recusado", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const center = lisbon(THURSDAY, "08:12", "30");
    const ten = intervalAround(center, 10);
    const res = await f.registro.edit(b.observationId, ten, NOW);
    expect([res.changed, res.rejected]).toEqual([true, []]);
    const o = await obsOf(f, b.observationId);
    // 08:02:30 a 08:22:30 = 20 min (≤ 30). Ponto médio 08:12:30 → +0,5 da base 08:12, como antes.
    expect([o.observedEndAt! - o.observedAt, o.matchStatus, o.deviationMin, o.recordedAt]).toEqual([20 * 60_000, "auto", 0.5, center]);

    const bad = await f.registro.edit(b.observationId, { observedEndAt: o.observedAt + 31 * 60_000 }, NOW);
    expect([bad.changed, bad.rejected]).toEqual([false, [{ field: "observedEndAt", code: "invalid_interval" }]]);
    expect((await obsOf(f, b.observationId)).observedEndAt).toBe(o.observedEndAt);
  });

  it("T-22: se o cálculo da dedução falha na edição, o fato fica salvo e a fila refaz depois", async () => {
    let failing = false;
    const f = await fixture({
      deduce: async (fact, network, ongoing) => {
        if (failing) throw new Error("falha forçada no cálculo");
        const { deduceObservation } = await import("@notebus/domain");
        return deduceObservation(fact, network, ongoing);
      },
    });
    const b = await boardL1(f, "08:30");
    await f.registro.chooseManual(b.observationId, { tripId: T0810, position: 2, serviceDate: THURSDAY }, NOW);
    failing = true;
    const res = await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "08:13") }, NOW);
    expect(res.changed).toBe(true);
    const kept = await obsOf(f, b.observationId);
    // O fato novo está gravado; a escolha caiu e a dedução está vazia (sem versão), esperando a fila.
    expect([kept.observedAt, kept.matchStatus, kept.matchRuleVersion, kept.tripId]).toEqual([lisbon(THURSDAY, "08:13"), null, null, null]);
    expect((await f.registro.refreshDeductions(NOW)).failed).toBe(1);
    failing = false;
    expect(await f.registro.refreshDeductions(NOW)).toEqual({ done: 1, failed: 0 });
    expect(deduction(await obsOf(f, b.observationId))).toMatchObject({ matchStatus: "auto", tripId: T0810, deviationMin: 1, matchRuleVersion: 1 });
  });
});

describe("T-38: mudar o tipo (D-099)", () => {
  it("embarquei → vi passar: ride dismissed (e a descida some); vi passar → embarquei: ride novo closed, sem cartão", async () => {
    const f = await fixture();
    // Embarque com descida (08:12:30 e 08:45), depois "vi passar": o par deixa de valer.
    const b = await boardL1(f, "08:12", "30");
    const trip = f.data.trips.find((t) => t.id === T0810)!;
    const down = await f.registro.alight({ rideId: b.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "08:45") });
    expect(down.ok).toBe(true);
    const alightId = (down as { token: { observationId: string } }).token.observationId;
    await f.registro.refreshDeductions(NOW);
    const full = await allRows(f);

    const toPassed = await f.registro.edit(b.observationId, { kind: "passed" }, NOW);
    expect(toPassed.changed).toBe(true);
    expect((await obsOf(f, b.observationId)).kind).toBe("passed");
    const dismissed = await rideOf(f, b.rideId);
    expect([dismissed.status, dismissed.alightingObservationId]).toEqual(["dismissed", null]);
    expect((await selectLive(f.db, observation, eq(observation.id, alightId))).length).toBe(0); // a descida foi apagada
    // Desfazer devolve o par e o ride aberto como estavam.
    await f.registro.restore(toPassed.token!, LATER);
    expect(noUpdatedAt(byId((await allRows(f)).obs))).toEqual(noUpdatedAt(full.obs));
    expect(noUpdatedAt((await allRows(f)).rides)).toEqual(noUpdatedAt(full.rides));

    // Um "vi passar" antigo (embarque aberto → Não embarquei) vira "embarquei": ride novo `closed`, sem cartão.
    const g = await fixture();
    const second = await g.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:42", "30") });
    await g.registro.refreshDeductions(NOW);
    await g.registro.notBoarded(second.rideId, lisbon(THURSDAY, "08:43"));
    expect((await rideOf(g, second.rideId)).status).toBe("dismissed");
    const toBoarded = await g.registro.edit(second.observationId, { kind: "boarded" }, NOW);
    expect(toBoarded.changed).toBe(true);
    const o = await obsOf(g, second.observationId);
    expect(o.kind).toBe("boarded");
    const live = await selectLive(g.db, ride);
    // O ride `dismissed` antigo saiu; há um só ride, novo, `closed`, ligado ao registro, com a viagem das 08:40.
    expect(live.map((r) => [r.status, r.boardingObservationId, r.alightingObservationId, r.tripId])).toEqual([["closed", second.observationId, null, T0840]]);
    expect(o.rideId).toBe(live[0]!.id);
    expect(live.some((r) => r.status === "open")).toBe(false); // sem ride aberto não há cartão "Em viagem" (RegistroProvider)
    // Desfazer: o ride novo some e o `dismissed` antigo volta.
    await g.registro.restore(toBoarded.token!, LATER);
    const back = await selectLive(g.db, ride);
    expect(back.map((r) => [r.id, r.status])).toEqual([[second.rideId, "dismissed"]]);
    expect((await obsOf(g, second.observationId)).kind).toBe("passed");
    expect((await obsOf(g, second.observationId)).rideId).toBe(second.rideId);
  });

  it("os dois tipos pesam igual na estimativa (D-073): o desvio é o mesmo", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:13");
    const asBoarded = passageRecords((await f.registro.load()).observations, f.data)[0]!;
    await f.registro.edit(b.observationId, { kind: "passed" }, NOW);
    const asPassed = passageRecords((await f.registro.load()).observations, f.data)[0]!;
    expect([asPassed.deviation, asPassed.tripId, asBoarded.deviation]).toEqual([1, T0810, 1]);
  });

  it("a descida não troca de tipo", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const trip = f.data.trips.find((t) => t.id === T0810)!;
    const down = await f.registro.alight({ rideId: b.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "08:45") });
    const alightId = (down as { token: { observationId: string } }).token.observationId;
    const res = await f.registro.edit(alightId, { kind: "passed" }, NOW);
    expect([res.changed, res.rejected]).toEqual([false, [{ field: "kind", code: "kind_locked" }]]);
  });
});

describe("T-39: apagar e Desfazer", () => {
  async function withAlight() {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const trip = f.data.trips.find((t) => t.id === T0810)!;
    const down = await f.registro.alight({ rideId: b.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "08:45") });
    const alightId = (down as { token: { observationId: string } }).token.observationId;
    await f.registro.refreshDeductions(NOW);
    return { f, b, alightId };
  }

  it("apagar o embarque que tem descida apaga o par e o ride; Desfazer devolve as linhas inteiras", async () => {
    const { f, b } = await withAlight();
    const before = await allRows(f);
    expect(before.obs).toHaveLength(2);
    const res = await f.registro.remove(b.observationId, LATER);
    expect(res.pair).toBe(true);
    expect(await allRows(f)).toEqual({ obs: [], rides: [] });
    await f.registro.restore(res.token, LATER + 1);
    const after = await allRows(f);
    // Linhas inteiras (fato e dedução), só o `updated_at` é outro.
    expect(noUpdatedAt(after.obs)).toEqual(noUpdatedAt(before.obs));
    expect(noUpdatedAt(after.rides)).toEqual(noUpdatedAt(before.rides));
    expect(after.obs.every((o) => o.updatedAt === LATER + 1)).toBe(true);
  });

  it("apagar só a descida mantém o embarque; o ride fica closed sem descida e não reabre o cartão; Desfazer devolve", async () => {
    const { f, b, alightId } = await withAlight();
    const before = await allRows(f);
    const res = await f.registro.remove(alightId, LATER);
    expect(res.pair).toBe(false);
    const rows = await allRows(f);
    expect(rows.obs.map((o) => o.id)).toEqual([b.observationId]);
    expect(rows.rides.map((r) => [r.status, r.alightingObservationId])).toEqual([["closed", null]]);
    await f.registro.restore(res.token, LATER + 1);
    const after = await allRows(f);
    expect(noUpdatedAt(after.obs)).toEqual(noUpdatedAt(before.obs));
    expect(noUpdatedAt(after.rides)).toEqual(noUpdatedAt(before.rides));
  });

  it("apagar um embarque aberto sem descida apaga o registro e o ride", async () => {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const res = await f.registro.remove(b.observationId, LATER);
    expect(res.pair).toBe(false);
    expect(await allRows(f)).toEqual({ obs: [], rides: [] });
  });
});

describe("T-40: a descida (§3.3)", () => {
  async function withAlight() {
    const f = await fixture();
    const b = await boardL1(f, "08:12", "30");
    const trip = f.data.trips.find((t) => t.id === T0810)!;
    const down = await f.registro.alight({ rideId: b.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "08:45") });
    const alightId = (down as { token: { observationId: string } }).token.observationId;
    await f.registro.refreshDeductions(NOW);
    return { f, b, alightId, patternId: trip.patternId };
  }

  it("descida para antes do embarque é descartada e o banco fica igual", async () => {
    const { f, alightId } = await withAlight();
    const before = await allRows(f);
    const res = await f.registro.edit(alightId, { observedAt: lisbon(THURSDAY, "08:10") }, NOW);
    expect(res).toEqual({ changed: false, rejected: [{ field: "alight", code: "before_boarding" }], token: null });
    expect(await allRows(f)).toEqual(before);
    // Pelo embarque: a mesma regra.
    const viaBoarding = await f.registro.edit((await allRows(f)).obs.find((o) => o.kind === "boarded")!.id, { alight: { observedAt: lisbon(THURSDAY, "08:10") } }, NOW);
    expect([viaBoarding.changed, viaBoarding.rejected]).toEqual([false, [{ field: "alight", code: "before_boarding" }]]);
    expect(await allRows(f)).toEqual(before);
  });

  it("posição não maior e outro percurso são recusados com o código certo; a nota da mesma edição grava", async () => {
    const { f, b, alightId, patternId } = await withAlight();
    const before = await allRows(f);
    const samePos = await f.registro.edit(b.observationId, { alight: { observedAt: lisbon(THURSDAY, "08:50"), patternId, position: 2 } }, NOW);
    expect(samePos.rejected).toEqual([{ field: "alight", code: "position_not_after" }]);
    const other = await f.registro.edit(b.observationId, { alight: { observedAt: lisbon(THURSDAY, "08:50"), patternId: "outro", position: 4 } }, NOW);
    expect(other.rejected).toEqual([{ field: "alight", code: "pattern_differs" }]);
    expect(await allRows(f)).toEqual(before);
    const withNote = await f.registro.edit(alightId, { observedAt: lisbon(THURSDAY, "08:10"), note: "desci cedo" }, NOW);
    expect([withNote.changed, withNote.rejected.map((r) => r.code)]).toEqual([true, ["before_boarding"]]);
    expect((await obsOf(f, alightId)).note).toBe("desci cedo");
    expect((await obsOf(f, alightId)).observedAt).toBe(lisbon(THURSDAY, "08:45"));
  });

  it("descida válida: grava a hora nova e refaz a dedução da descida (08:50 = 530 → +6 da das 08:10)", async () => {
    const { f, alightId } = await withAlight();
    const res = await f.registro.edit(alightId, { observedAt: lisbon(THURSDAY, "08:50") }, NOW);
    expect([res.changed, res.rejected]).toEqual([true, []]);
    const o = await obsOf(f, alightId);
    // Campus pos. 5: 08:50 = 530 − 524 = +6, dentro da janela, e dentro da viagem das 08:10 (D-071).
    expect([o.observedAt, o.mode, o.matchStatus, o.tripId, o.deviationMin]).toEqual([lisbon(THURSDAY, "08:50"), "later", "auto", T0810, 6]);
    const viaBoarding = await f.registro.edit((await allRows(f)).obs.find((x) => x.kind === "boarded")!.id, { alight: { observedAt: lisbon(THURSDAY, "08:52") } }, NOW);
    expect(viaBoarding.changed).toBe(true);
    expect((await obsOf(f, alightId)).observedAt).toBe(lisbon(THURSDAY, "08:52"));
  });

  it("mudar a hora do embarque confere com a descida; se o embarque vira órfão não há como conferir e passa", async () => {
    const { f, b } = await withAlight();
    // 08:46 casa com a das 08:40 (08:42 → +4): descida às 08:45 ficaria antes do embarque.
    const before = await allRows(f);
    const refused = await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "08:46") }, NOW);
    expect([refused.changed, refused.rejected]).toEqual([false, [{ field: "observedAt", code: "before_boarding" }]]);
    expect(await allRows(f)).toEqual(before);
    // 09:30 não casa com nada (08:42 → +48): o embarque vira órfão e a mudança passa.
    const passes = await f.registro.edit(b.observationId, { observedAt: lisbon(THURSDAY, "09:30") }, NOW);
    expect([passes.changed, passes.rejected]).toEqual([true, []]);
    expect((await obsOf(f, b.observationId)).matchStatus).toBe("orphan");
  });
});

describe("Desfazer só mexe no que é do token", () => {
  it("restore não apaga nem altera um registro que não é do token", async () => {
    const f = await fixture();
    const a = await boardL1(f, "08:12", "30");
    const other = await f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:42", "30") });
    await f.registro.refreshDeductions(NOW);
    const edited = await f.registro.edit(a.observationId, { note: "primeiro" }, NOW);
    // Outro registro muda depois da edição do primeiro.
    await f.registro.edit(other.observationId, { note: "segundo" }, LATER);
    const otherBefore = await obsOf(f, other.observationId);
    await f.registro.restore(edited.token!, LATER + 1);
    expect((await obsOf(f, a.observationId)).note).toBeNull();
    expect(await obsOf(f, other.observationId)).toEqual(otherBefore); // inclusive o `updated_at`
    // O token só guarda o que a operação mudou: o ride e o outro registro nem entram.
    expect([edited.token!.observations.map((o) => o.id), edited.token!.rides, edited.token!.createdRideIds]).toEqual([[a.observationId], [], []]);
  });
});
