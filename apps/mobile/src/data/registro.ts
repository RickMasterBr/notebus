/**
 * Gravação do registro (E-03 bloco 2; plano §3.2 e §4): o **fato primeiro**, a **dedução depois** (D-085).
 *
 * - `board`: numa transação só, grava o `observation` (embarquei) e um `ride` novo `open` e fecha o `ride` aberto que
 *   houver (T-26). Devolve assim que o fato está no banco; a dedução roda depois (`refreshDeductions`) e nunca atrasa
 *   o toast nem o cartão.
 * - `refreshDeductions`: a fila simples (§3.2): todo registro sem `match_rule_version`, ou com versão velha, é deduzido
 *   de novo pelo domínio (`deduceObservation`). `match_status = manual` nunca é recalculado (D-085). Falha num registro
 *   não derruba os outros nem apaga nada: o fato continua salvo e a dedução é refeita na vez seguinte (T-22).
 * - `alight`, `notBoarded`, `dismiss` e os seus desfazeres: o ciclo do `ride` do domínio (`ride.ts`).
 *
 * Tudo que escreve passa por uma fila (uma gravação por vez) e por `BEGIN … COMMIT` explícitos: o banco do app é
 * síncrono (expo-sqlite) e o dos testes é assíncrono (node:sqlite), e o `db.transaction` do Drizzle não serve aos dois.
 * Sem relógio e sem React aqui: o instante vem de quem chama, para o teste poder fixá-lo.
 */
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import {
  type Deduction,
  type MatchNetwork,
  type ObservationFact,
  type OngoingRide,
  type RideState,
  alightRide,
  deduceObservation,
  displayCenter,
  dismissRide,
  expireRide,
  expireRideWithoutTrip,
  notBoarded as domainNotBoarded,
  uuidv7,
} from "@notebus/domain";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { resolveBoarding } from "./rideView";
import { patternStopKey, type ScheduleSnapshot } from "./schedule";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type ObservationRow = typeof observation.$inferSelect;
export type RideRow = typeof ride.$inferSelect;

/** Versão da regra de dedução gravada em `match_rule_version`. Sobe quando o casamento do domínio mudar. */
export const MATCH_RULE_VERSION = 1;

export interface RegistroDeps {
  /** A rede para o domínio deduzir; `null` enquanto os horários não carregaram (a dedução espera). */
  network: () => MatchNetwork | null;
  /** Os horários inteiros, para achar o `pattern_stop_id` de uma passagem. */
  snapshot: () => ScheduleSnapshot | null;
  /** Padrão: o `deduceObservation` do domínio. Os testes trocam por uma versão que falha ou demora. */
  deduce?: (fact: ObservationFact, network: MatchNetwork, ride: OngoingRide | null) => Deduction | Promise<Deduction>;
  newId?: (now: number) => string;
}

/** O que o Desfazer do embarque precisa saber. */
export interface BoardToken {
  observationId: string;
  rideId: string;
  /** Os `ride` que este embarque fechou (T-26): o Desfazer os reabre. */
  reopenedRideIds: string[];
}

export interface AlightToken {
  observationId: string;
  rideId: string;
}

export type AlightResult =
  | { ok: true; token: AlightToken; minutes: number; at: number }
  | { ok: false; problem: string };

export interface DeductionRun {
  /** Registros deduzidos e registros em que o cálculo falhou nesta passada. */
  done: number;
  failed: number;
}

/** Minutos de viagem para mostrar: arredonda como o resto do app, meio minuto sobe (34,5 → 35; D-092). */
export function rideMinutes(boardedAt: number, alightedAt: number): number {
  return displayCenter((alightedAt - boardedAt) / 60_000);
}

export function createRegistro(db: AnyDb, deps: RegistroDeps) {
  const deduce = deps.deduce ?? deduceObservation;
  const newId = deps.newId ?? ((now: number) => uuidv7(now));
  let queue: Promise<unknown> = Promise.resolve();

  /** Uma gravação por vez, na ordem em que chegaram; um erro não trava as seguintes. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  async function inTransaction<T>(body: () => Promise<T>): Promise<T> {
    await db.run(sql`begin immediate`);
    try {
      const result = await body();
      await db.run(sql`commit`);
      return result;
    } catch (error) {
      await db.run(sql`rollback`);
      throw error;
    }
  }

  const rideState = (r: RideRow): RideState => ({
    id: r.id,
    boardingObservationId: r.boardingObservationId,
    alightingObservationId: r.alightingObservationId,
    tripId: r.tripId,
    status: r.status,
  });

  async function rideById(id: string): Promise<RideRow | undefined> {
    return (await selectLive(db, ride, eq(ride.id, id)).limit(1))[0];
  }
  async function observationById(id: string): Promise<ObservationRow | undefined> {
    return (await selectLive(db, observation, eq(observation.id, id)).limit(1))[0];
  }

  // ─── Embarque ────────────────────────────────────────────────────────────

  /**
   * Fato do embarque: `observed_at` = `recorded_at` (o mesmo instante, com segundos), `kind = boarded`, `mode = live`,
   * `ride` novo `open`; o `ride` aberto que houver fecha na mesma transação. Sem localização (E-07): nenhum `gps_*`.
   */
  function board(input: { stopId: string; lineId: string; at: number }): Promise<BoardToken> {
    return enqueue(async () => {
      const { at } = input;
      const observationId = newId(at);
      const rideId = newId(at);
      const reopenedRideIds: string[] = [];
      await inTransaction(async () => {
        for (const open of await selectLive(db, ride, eq(ride.status, "open"))) {
          await db.update(ride).set({ status: "closed", updatedAt: at }).where(eq(ride.id, open.id));
          reopenedRideIds.push(open.id);
        }
        await db.insert(ride).values({
          id: rideId,
          createdAt: at,
          updatedAt: at,
          source: "user",
          boardingObservationId: observationId,
          alightingObservationId: null,
          tripId: null,
          status: "open",
        });
        await db.insert(observation).values({
          id: observationId,
          createdAt: at,
          updatedAt: at,
          source: "user",
          stopId: input.stopId,
          lineId: input.lineId,
          observedAt: at,
          observedEndAt: null,
          kind: "boarded",
          mode: "live",
          rideId,
          recordedAt: at,
        });
      });
      return { observationId, rideId, reopenedRideIds };
    });
  }

  /** Desfazer o embarque: apaga o registro e o `ride` (`deleted_at`) e reabre o que ele tinha fechado. */
  function undoBoard(token: BoardToken, at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        await db.update(observation).set({ deletedAt: at, updatedAt: at }).where(eq(observation.id, token.observationId));
        await db.update(ride).set({ deletedAt: at, updatedAt: at }).where(eq(ride.id, token.rideId));
        for (const id of token.reopenedRideIds) {
          await db.update(ride).set({ status: "open", updatedAt: at }).where(and(eq(ride.id, id), isNull(ride.deletedAt)));
        }
      }),
    );
  }

  // ─── Descida ─────────────────────────────────────────────────────────────

  /**
   * "Desci aqui": o `alighted` entra no mesmo `ride` e o `ride` fecha. O invariante 5 é conferido antes: percurso
   * igual, posição maior e hora maior ou igual. `trip` é a viagem do `ride` (a lista da descida sai dela).
   */
  function alight(input: {
    rideId: string;
    stopId: string;
    patternId: string;
    position: number;
    at: number;
  }): Promise<AlightResult> {
    return enqueue(async (): Promise<AlightResult> => {
      const row = await rideById(input.rideId);
      const boarding = row ? await observationById(row.boardingObservationId) : undefined;
      if (!row || !boarding) return { ok: false, problem: "viagem não encontrada" };
      const network = deps.network();
      const start = network ? resolveBoarding(boarding, network) : null;
      if (!start) return { ok: false, problem: "viagem sem percurso conhecido" };

      const observationId = newId(input.at);
      let next: RideState;
      try {
        next = alightRide(
          rideState(row),
          observationId,
          { patternId: start.patternId, position: start.position, observedAt: boarding.observedAt },
          { patternId: input.patternId, position: input.position, observedAt: input.at },
        );
      } catch (error) {
        return { ok: false, problem: error instanceof Error ? error.message : String(error) };
      }
      await inTransaction(async () => {
        await db.insert(observation).values({
          id: observationId,
          createdAt: input.at,
          updatedAt: input.at,
          source: "user",
          stopId: input.stopId,
          lineId: boarding.lineId,
          observedAt: input.at,
          observedEndAt: null,
          kind: "alighted",
          mode: "live",
          rideId: row.id,
          recordedAt: input.at,
        });
        await db
          .update(ride)
          .set({ alightingObservationId: next.alightingObservationId, status: next.status, updatedAt: input.at })
          .where(eq(ride.id, row.id));
      });
      return {
        ok: true,
        token: { observationId, rideId: row.id },
        minutes: rideMinutes(boarding.observedAt, input.at),
        at: input.at,
      };
    });
  }

  /** Desfazer a descida: "Você continua em viagem" — apaga o `alighted` e reabre o `ride`. */
  function undoAlight(token: AlightToken, at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        await db.update(observation).set({ deletedAt: at, updatedAt: at }).where(eq(observation.id, token.observationId));
        await db.update(ride).set({ alightingObservationId: null, status: "open", updatedAt: at }).where(eq(ride.id, token.rideId));
      }),
    );
  }

  // ─── Não embarquei e Dispensar ───────────────────────────────────────────

  /** "Não embarquei" (D-073): o embarque vira "vi passar" (`passed`) e o `ride` vira `dismissed`. */
  function notBoarded(rideId: string, at: number): Promise<void> {
    return enqueue(async () => {
      const row = await rideById(rideId);
      if (!row) throw new Error("viagem não encontrada");
      const { ride: next, boardingKind } = domainNotBoarded(rideState(row));
      await inTransaction(async () => {
        await db.update(observation).set({ kind: boardingKind, updatedAt: at }).where(eq(observation.id, row.boardingObservationId));
        await db.update(ride).set({ status: next.status, updatedAt: at }).where(eq(ride.id, rideId));
      });
    });
  }

  function undoNotBoarded(rideId: string, at: number): Promise<void> {
    return enqueue(async () => {
      const row = await rideById(rideId);
      if (!row) throw new Error("viagem não encontrada");
      await inTransaction(async () => {
        await db.update(observation).set({ kind: "boarded", updatedAt: at }).where(eq(observation.id, row.boardingObservationId));
        await db.update(ride).set({ status: "open", updatedAt: at }).where(eq(ride.id, rideId));
      });
    });
  }

  /** "Dispensar": fecha sem descida. */
  function dismiss(rideId: string, at: number): Promise<void> {
    return enqueue(async () => {
      const row = await rideById(rideId);
      if (!row) throw new Error("viagem não encontrada");
      const next = dismissRide(rideState(row));
      await db.update(ride).set({ status: next.status, updatedAt: at }).where(eq(ride.id, rideId));
    });
  }

  function undoDismiss(rideId: string, at: number): Promise<void> {
    return enqueue(async () => {
      await db.update(ride).set({ status: "open", updatedAt: at }).where(eq(ride.id, rideId));
    });
  }

  // ─── Fechamento automático ───────────────────────────────────────────────

  /**
   * Fecha, sem descida e sem aviso, o `ride` aberto cuja viagem passou do fim do percurso + a folga da configuração
   * (E-03 §4, Q-82: +30 min). Devolve quantos fechou. Um `ride` sem viagem conhecida (registro `orphan` sem candidato)
   * fecha 3 h depois do embarque (Q-85).
   */
  function expire(now: number): Promise<number> {
    return enqueue(async () => {
      const network = deps.network();
      if (!network) return 0;
      let closed = 0;
      for (const open of await selectLive(db, ride, eq(ride.status, "open"))) {
        const boarding = await observationById(open.boardingObservationId);
        const start = boarding ? resolveBoarding(boarding, network) : null;
        const trip = start ? network.trips.find((t) => t.id === start.tripId) : undefined;
        // Sem viagem conhecida não há fim de percurso: fecha 3 h depois do embarque (Q-85).
        const next = start && trip
          ? expireRide(rideState(open), trip, start.serviceDate, now)
          : boarding
            ? expireRideWithoutTrip(rideState(open), boarding.observedAt, now)
            : rideState(open);
        if (next.status === open.status) continue;
        await db.update(ride).set({ status: next.status, updatedAt: now }).where(eq(ride.id, open.id));
        closed++;
      }
      return closed;
    });
  }

  // ─── Dedução (fila) ──────────────────────────────────────────────────────

  async function deduceOne(row: ObservationRow, network: MatchNetwork, now: number): Promise<void> {
    const parent = row.rideId ? await rideById(row.rideId) : undefined;
    // D-071: dentro de uma viagem em curso só contam as passagens dela. O embarque que abriu o `ride` não se apoia nele.
    let ongoing: OngoingRide | null = null;
    if (parent && parent.boardingObservationId !== row.id) {
      const boarding = await observationById(parent.boardingObservationId);
      if (boarding?.tripId && boarding.serviceDate && (boarding.matchStatus === "auto" || boarding.matchStatus === "manual")) {
        ongoing = { lineId: boarding.lineId, tripId: boarding.tripId, serviceDate: boarding.serviceDate };
      }
    }
    const fact: ObservationFact = {
      stopId: row.stopId,
      lineId: row.lineId,
      observedAt: row.observedAt,
      observedEndAt: row.observedEndAt,
      kind: row.kind,
      mode: row.mode,
    };
    const result = await deduce(fact, network, ongoing);
    const snapshot = deps.snapshot();
    const auto = result.matchStatus === "auto";
    await inTransaction(async () => {
      await db
        .update(observation)
        .set({
          serviceDate: result.serviceDate,
          // A coluna é inteira: o minuto cheio. O desvio, abaixo, sai do instante exato (decimais).
          serviceMinute: Math.floor(result.serviceMinute),
          patternStopId: auto && result.patternId !== null && result.position !== null
            ? (snapshot?.patternStopIds.get(patternStopKey(result.patternId, result.position)) ?? null)
            : null,
          tripId: auto ? result.tripId : null,
          matchStatus: result.matchStatus,
          deviationMin: auto ? result.deviation : null,
          matchRuleVersion: MATCH_RULE_VERSION,
          updatedAt: now,
        })
        .where(eq(observation.id, row.id));
      if (parent && parent.boardingObservationId === row.id) {
        await db.update(ride).set({ tripId: auto ? result.tripId : null, updatedAt: now }).where(eq(ride.id, parent.id));
      }
    });
  }

  /**
   * A fila da dedução: todo registro vivo sem versão da regra, ou com versão velha, e que não seja `manual`.
   * Vai pelo horário do registro (o embarque antes da descida do mesmo `ride`). Sem rede carregada, não faz nada.
   */
  function refreshDeductions(now: number): Promise<DeductionRun> {
    return enqueue(async () => {
      const network = deps.network();
      if (!network) return { done: 0, failed: 0 };
      const stale = await selectLive(
        db,
        observation,
        and(
          or(isNull(observation.matchRuleVersion), lt(observation.matchRuleVersion, MATCH_RULE_VERSION)),
          or(isNull(observation.matchStatus), ne(observation.matchStatus, "manual")),
        ),
      );
      stale.sort((a, b) => a.observedAt - b.observedAt || a.createdAt - b.createdAt);
      const run: DeductionRun = { done: 0, failed: 0 };
      for (const row of stale) {
        try {
          await deduceOne(row, network, now);
          run.done++;
        } catch {
          run.failed++; // o fato segue salvo; na próxima vez a fila tenta de novo
        }
      }
      return run;
    });
  }

  /** Tudo que as telas leem: os registros e as viagens vivos. Pouca coisa (uns 10 registros por dia). */
  async function load(): Promise<{ observations: ObservationRow[]; rides: RideRow[] }> {
    const [observations, rides] = await Promise.all([selectLive(db, observation), selectLive(db, ride)]);
    return { observations, rides };
  }

  return { board, undoBoard, alight, undoAlight, notBoarded, undoNotBoarded, dismiss, undoDismiss, expire, refreshDeductions, load };
}

export type Registro = ReturnType<typeof createRegistro>;
