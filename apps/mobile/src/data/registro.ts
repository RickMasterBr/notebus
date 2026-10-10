/**
 * Gravação do registro (E-03 bloco 2; plano §3.2 e §4): o **fato primeiro**, a **dedução depois** (D-085).
 *
 * - `board`: numa transação só, grava o `observation` (embarquei) e um `ride` novo `open` e fecha o `ride` aberto que
 *   houver (T-26). Devolve assim que o fato está no banco; a dedução roda depois (`refreshDeductions`) e nunca atrasa
 *   o toast nem o cartão.
 * - `refreshDeductions`: a fila simples (§3.2): todo registro sem `match_rule_version`, ou com versão velha, é deduzido
 *   de novo pelo domínio (`deduceObservation`). `match_status = manual` nunca é recalculado (D-085). Falha num registro
 *   não derruba os outros nem apaga nada: o fato continua salvo e a dedução é refeita na vez seguinte (T-22).
 * - `rematchWhere`: depois de uma mudança no calendário (E-08), refaz a dedução dos registros cuja data de serviço mudou de tipo
 *   de dia. Só a dedução muda; a hora do registro nunca (D-085), e `match_status = manual` nunca entra.
 * - `alight`, `notBoarded`, `dismiss` e os seus desfazeres: o ciclo do `ride` do domínio (`ride.ts`).
 *
 * Tudo que escreve passa por uma fila (uma gravação por vez) e por `BEGIN … COMMIT` explícitos: o banco do app é
 * síncrono (expo-sqlite) e o dos testes é assíncrono (node:sqlite), e o `db.transaction` do Drizzle não serve aos dois.
 * Sem relógio e sem React aqui: o instante vem de quem chama, para o teste poder fixá-lo.
 */
import { and, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import {
  type Deduction,
  type MatchNetwork,
  type ObservationFact,
  type OngoingRide,
  type PositionFix,
  type RideState,
  alightRide,
  baseTimeAt,
  checkAlightEdit,
  checkObservationInterval,
  deduceObservation,
  displayCenter,
  dismissRide,
  expireRide,
  expireRideWithoutTrip,
  matchInstant,
  modeFor,
  notBoarded as domainNotBoarded,
  uuidv7,
} from "@notebus/domain";
import { selectLive } from "../db/query";
import { observation, ride } from "../db/schema";
import { resolveBoarding, serviceMinuteOn } from "./rideView";
import { gpsColumns } from "./recordFix";
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

/**
 * O que o Desfazer das edições da E-04 guarda: uma **cópia das linhas que a operação mudou**, inteiras (fato **e**
 * dedução, inclusive `manual`, `tripId`, `patternStopId`, `deviationMin`, `reviewDismissedAt`, `deletedAt`), mais os
 * `ride` que ela criou (o Desfazer os apaga). Fica na memória: o app não guarda histórico (E-04 §4.1).
 */
export interface EditToken {
  observations: ObservationRow[];
  rides: RideRow[];
  createdRideIds: string[];
}

/** Por que uma parte da edição foi descartada (a TL-06 mostra "Alteração não gravada"). Nada inválido é gravado. */
export type EditRejection = {
  field: "observedAt" | "observedEndAt" | "kind" | "stopId" | "alight";
  code: "future" | "invalid_interval" | "before_boarding" | "position_not_after" | "pattern_differs" | "kind_locked" | "stop_locked" | "no_alight";
};

/** A descida do mesmo `ride` (a mesma estrutura serve para o `alight` do embarque e para a edição direta da descida). */
export interface AlightPatch {
  observedAt?: number;
  stopId?: string;
  /** A passagem escolhida na lista da descida, para conferir o invariante 5 (como em `alight`). */
  patternId?: string;
  position?: number;
}

/** O que a TL-06 pode mudar no fato (E-04 §3.1). `undefined` = não mexe. */
export interface EditPatch {
  observedAt?: number;
  observedEndAt?: number | null;
  /** Só entre `boarded` e `passed` (D-099). */
  kind?: "boarded" | "passed";
  /** O switch "Anotei de memória" (D-067). */
  memory?: boolean;
  note?: string | null;
  /** Só num embarque cujo `ride` tem descida. */
  alight?: AlightPatch;
  /** Só em `kind = alighted`: hora, ponto, nota e memória (§3.1). Num embarque o ponto não se edita. */
  stopId?: string;
  patternId?: string;
  position?: number;
}

export interface EditResult {
  /** `false` = nada foi gravado (nem `updated_at`): a folha fecha calada. */
  changed: boolean;
  rejected: EditRejection[];
  /** O Desfazer; `null` quando nada foi gravado. */
  token: EditToken | null;
}

export type ManualResult = { ok: true; token: EditToken } | { ok: false; problem: string };

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
   * `ride` novo `open`; o `ride` aberto que houver fecha na mesma transação. `gps` é a última posição **já em memória**
   * (até 10 min, quem chama confere): vai em `gps_*` só porque o registro é ao vivo; sem posição, as colunas ficam vazias.
   */
  function board(input: { stopId: string; lineId: string; at: number; gps?: PositionFix | null }): Promise<BoardToken> {
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
          ...gpsColumns("live", input.gps),
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
    gps?: PositionFix | null;
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
          ...gpsColumns("live", input.gps),
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
        const hasKnownTrip = Boolean(
          boarding?.tripId &&
          boarding.serviceDate &&
          (boarding.matchStatus === "auto" || boarding.matchStatus === "manual"),
        );
        const trip = hasKnownTrip ? network.trips.find((t) => t.id === boarding!.tripId) : undefined;
        // Sem viagem conhecida não há fim de percurso: fecha 3 h depois do embarque (Q-85).
        const next = trip && boarding?.serviceDate
          ? expireRide(rideState(open), trip, boarding.serviceDate, now)
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

  /**
   * D-071: dentro de uma viagem em curso só contam as passagens dela. O embarque que abriu o `ride` não se apoia nele;
   * uma descida (ou outro registro do mesmo `ride`) sim, se o embarque já tem viagem (`auto` ou `manual`).
   */
  async function ongoingFor(row: ObservationRow): Promise<OngoingRide | null> {
    const parent = row.rideId ? await rideById(row.rideId) : undefined;
    if (!parent || parent.boardingObservationId === row.id) return null;
    const boarding = await observationById(parent.boardingObservationId);
    if (boarding?.tripId && boarding.serviceDate && (boarding.matchStatus === "auto" || boarding.matchStatus === "manual")) {
      return { lineId: boarding.lineId, tripId: boarding.tripId, serviceDate: boarding.serviceDate };
    }
    return null;
  }

  const factOfRow = (row: ObservationRow): ObservationFact => ({
    stopId: row.stopId,
    lineId: row.lineId,
    observedAt: row.observedAt,
    observedEndAt: row.observedEndAt,
    kind: row.kind,
    mode: row.mode,
  });

  async function deduceOne(row: ObservationRow, network: MatchNetwork, now: number): Promise<void> {
    const parent = row.rideId ? await rideById(row.rideId) : undefined;
    const ongoing = await ongoingFor(row);
    const result = await deduce(factOfRow(row), network, ongoing);
    const snapshot = deps.snapshot();
    const auto = result.matchStatus === "auto";
    const newServiceDate = result.serviceDate;
    const newServiceMinute = Math.floor(result.serviceMinute);
    const newPatternStopId = auto && result.patternId !== null && result.position !== null
      ? (snapshot?.patternStopIds.get(patternStopKey(result.patternId, result.position)) ?? null)
      : null;
    const newTripId = auto ? result.tripId : null;
    const newMatchStatus = result.matchStatus;
    const newDeviationMin = auto ? result.deviation : null;

    const deviationsEqual =
      (row.deviationMin === null && newDeviationMin === null) ||
      (row.deviationMin !== null && newDeviationMin !== null && Math.abs(row.deviationMin - newDeviationMin) < 1e-6);

    const observationChanged =
      row.serviceDate !== newServiceDate ||
      row.serviceMinute !== newServiceMinute ||
      row.patternStopId !== newPatternStopId ||
      row.tripId !== newTripId ||
      row.matchStatus !== newMatchStatus ||
      !deviationsEqual;

    const rideTripId = auto ? result.tripId : null;
    const rideChanged = Boolean(parent && parent.boardingObservationId === row.id && parent.tripId !== rideTripId);

    if (!observationChanged && !rideChanged && row.matchRuleVersion === MATCH_RULE_VERSION) {
      return;
    }

    await inTransaction(async () => {
      if (observationChanged || row.matchRuleVersion !== MATCH_RULE_VERSION) {
        await db
          .update(observation)
          .set({
            serviceDate: newServiceDate,
            serviceMinute: newServiceMinute,
            patternStopId: newPatternStopId,
            tripId: newTripId,
            matchStatus: newMatchStatus,
            deviationMin: newDeviationMin,
            matchRuleVersion: MATCH_RULE_VERSION,
            updatedAt: observationChanged ? now : row.updatedAt,
          })
          .where(eq(observation.id, row.id));
      }
      if (rideChanged && parent) {
        await db.update(ride).set({ tripId: rideTripId, updatedAt: now }).where(eq(ride.id, parent.id));
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

  /**
   * Recasa os registros vivos, com dedução e não `manual`, cuja data de serviço `changed` aponta (E-08 §3.3: o feriado ou a
   * exceção mudou o tipo de dia daquela data). `network` é a rede **já recarregada** com o calendário novo. Mesma
   * regra de `refreshDeductions`: só as colunas da dedução mudam, a falha de um registro não derruba os outros.
   */
  function rematchWhere(changed: (serviceDate: string) => boolean, network: MatchNetwork, now: number): Promise<DeductionRun> {
    return enqueue(async () => {
      const candidates = await selectLive(
        db,
        observation,
        and(isNotNull(observation.serviceDate), or(isNull(observation.matchStatus), ne(observation.matchStatus, "manual"))),
      );
      const affected = candidates.filter((row) => changed(row.serviceDate!));
      affected.sort((a, b) => a.observedAt - b.observedAt || a.createdAt - b.createdAt);
      const run: DeductionRun = { done: 0, failed: 0 };
      for (const row of affected) {
        try {
          await deduceOne(row, network, now);
          run.done++;
        } catch {
          run.failed++; // o fato segue salvo; a dedução antiga fica até a próxima vez
        }
      }
      return run;
    });
  }

  // ─── Editar, conferir e apagar (E-04 bloco 1) ────────────────────────────

  type ObservationSet = Partial<typeof observation.$inferInsert>;
  interface Before {
    observations: ObservationRow[];
    rides: RideRow[];
  }
  /** As colunas da dedução; limpas quando o fato muda e refeitas logo depois (ou na vez seguinte, T-22). */
  const CLEARED_DEDUCTION = {
    serviceDate: null,
    serviceMinute: null,
    patternStopId: null,
    tripId: null,
    matchStatus: null,
    deviationMin: null,
    matchRuleVersion: null,
    reviewDismissedAt: null,
  } as const;

  const sameRow = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

  /** Cópia das linhas vivas, antes de a operação mexer nelas. */
  async function captureBefore(observationIds: (string | undefined)[], rideIds: (string | undefined)[]): Promise<Before> {
    const observations: ObservationRow[] = [];
    const rides: RideRow[] = [];
    for (const id of new Set(observationIds)) {
      const found = id ? await observationById(id) : undefined;
      if (found) observations.push({ ...found });
    }
    for (const id of new Set(rideIds)) {
      const found = id ? await rideById(id) : undefined;
      if (found) rides.push({ ...found });
    }
    return { observations, rides };
  }

  /** O Desfazer do que mudou desde `before`: só entram as linhas que ficaram diferentes (ou apagadas). */
  async function tokenSince(before: Before, createdRideIds: string[] = []): Promise<EditToken> {
    const observations: ObservationRow[] = [];
    for (const o of before.observations) {
      const now = await observationById(o.id);
      if (!now || !sameRow(now, o)) observations.push(o);
    }
    const rides: RideRow[] = [];
    for (const r of before.rides) {
      const now = await rideById(r.id);
      if (!now || !sameRow(now, r)) rides.push(r);
    }
    return { observations, rides, createdRideIds };
  }

  /** A passagem gravada na dedução de um registro (percurso e posição), ou `null`. */
  function passageOfRow(row: ObservationRow): { patternId: string; position: number } | null {
    const found = row.patternStopId ? deps.snapshot()?.patternStopById.get(row.patternStopId) : undefined;
    return found ? { patternId: found.patternId, position: found.position } : null;
  }

  /** O lado do embarque para o invariante 5: a dedução gravada; sem ela, o par mais perto (como o `alight`); senão só a hora. */
  function boardPointOf(boarding: ObservationRow, observedAt: number) {
    const stored = passageOfRow(boarding);
    if (stored) return { ...stored, observedAt };
    const network = deps.network();
    const near = network ? resolveBoarding(boarding, network) : null;
    return { patternId: near?.patternId ?? null, position: near?.position ?? null, observedAt };
  }

  async function alightRowOf(parent: RideRow | undefined): Promise<ObservationRow | undefined> {
    return parent?.alightingObservationId ? observationById(parent.alightingObservationId) : undefined;
  }

  /**
   * Edita o fato (TL-06, E-04 §3.1) e refaz a dedução na hora, na mesma fila. A hora do toque (`recorded_at`) nunca muda.
   * - Sem mudança real: nada é gravado (nem `updated_at`).
   * - D-097: mudar a hora ou o intervalo derruba a escolha `manual`, limpa a marca "Não sei" e recalcula do zero; mudar
   *   só nota, memória ou tipo não mexe na escolha.
   * - D-099: embarquei → vi passar fecha o `ride` como `dismissed` e apaga a descida; vi passar → embarquei cria um
   *   `ride` novo já `closed`, sem cartão "Em viagem".
   * - §3.3: hora no futuro, intervalo inválido e descida que quebra o invariante 5 descartam **só essa mudança**
   *   (`rejected`); o resto grava. Nunca grava estado inválido.
   * - Se o cálculo da dedução falhar, o fato fica salvo e a fila refaz na vez seguinte (T-22).
   */
  function edit(id: string, patch: EditPatch, at: number): Promise<EditResult> {
    return enqueue(async (): Promise<EditResult> => {
      const row = await observationById(id);
      if (!row) throw new Error("registro não encontrado");
      const network = deps.network();
      const parent = row.rideId ? await rideById(row.rideId) : undefined;
      const isAlight = row.kind === "alighted";
      const ownRide = parent !== undefined && parent.boardingObservationId === row.id ? parent : undefined;
      const alightRow = ownRide ? await alightRowOf(ownRide) : undefined;
      const boardingRow = isAlight && parent ? await observationById(parent.boardingObservationId) : undefined;
      const before = await captureBefore([row.id, alightRow?.id], [parent?.id]);
      const rejected: EditRejection[] = [];
      const set: ObservationSet = {};

      // Tipo (D-099): só entre embarquei e vi passar.
      let kindChange: "boarded" | "passed" | null = null;
      if (patch.kind !== undefined && patch.kind !== row.kind) {
        if (isAlight) rejected.push({ field: "kind", code: "kind_locked" });
        else kindChange = patch.kind;
      }
      const becomesPassed = kindChange === "passed";

      // Hora e intervalo (§3.1): o ponto médio não pode estar no futuro e o intervalo respeita a invariante 4.
      let timeChanged = false;
      let nextAt = row.observedAt;
      let nextEnd = row.observedEndAt;
      if (patch.observedAt !== undefined || patch.observedEndAt !== undefined) {
        const wantAt = patch.observedAt ?? row.observedAt;
        const wantEnd = patch.observedEndAt !== undefined ? patch.observedEndAt : row.observedEndAt;
        if (wantAt !== row.observedAt || wantEnd !== row.observedEndAt) {
          if (checkObservationInterval(wantAt, wantEnd) !== null) rejected.push({ field: "observedEndAt", code: "invalid_interval" });
          else if (matchInstant({ observedAt: wantAt, observedEndAt: wantEnd }) > at) rejected.push({ field: "observedAt", code: "future" });
          else {
            timeChanged = true;
            nextAt = wantAt;
            nextEnd = wantEnd;
          }
        }
      }
      const dropTime = () => {
        timeChanged = false;
        nextAt = row.observedAt;
        nextEnd = row.observedEndAt;
      };

      // O ponto não se edita num embarque; numa descida sim (§3.1).
      let stopChanged = false;
      if (patch.stopId !== undefined && patch.stopId !== row.stopId) {
        if (isAlight) stopChanged = true;
        else rejected.push({ field: "stopId", code: "stop_locked" });
      }

      // Edição direta da descida: confere o invariante 5 contra o embarque (§3.3).
      if (isAlight && boardingRow && (timeChanged || stopChanged || patch.patternId !== undefined || patch.position !== undefined)) {
        const stored = passageOfRow(row);
        const alightPoint = {
          patternId: patch.patternId ?? (stopChanged ? null : (stored?.patternId ?? null)),
          position: patch.position ?? (stopChanged ? null : (stored?.position ?? null)),
          observedAt: nextAt,
        };
        const code = checkAlightEdit(boardPointOf(boardingRow, boardingRow.observedAt), alightPoint);
        if (code) {
          rejected.push({ field: "alight", code });
          dropTime();
          stopChanged = false;
        }
      }

      // A descida de um embarque, editada pelo embarque (§3.1): hora e ponto, conferidos contra a passagem do embarque.
      let alightSet: ObservationSet | null = null;
      let alightPoint: { patternId: string | null; position: number | null; observedAt: number } | null = null;
      if (patch.alight !== undefined) {
        if (!alightRow || becomesPassed) rejected.push({ field: "alight", code: "no_alight" });
        else {
          const a = patch.alight;
          const newAt = a.observedAt ?? alightRow.observedAt;
          const newStop = a.stopId ?? alightRow.stopId;
          const stopMoved = newStop !== alightRow.stopId;
          if (newAt !== alightRow.observedAt || stopMoved) {
            const stored = passageOfRow(alightRow);
            const point = {
              patternId: a.patternId ?? (stopMoved ? null : (stored?.patternId ?? null)),
              position: a.position ?? (stopMoved ? null : (stored?.position ?? null)),
              observedAt: newAt,
            };
            const code = newAt > at ? "future" : checkAlightEdit(boardPointOf(row, nextAt), point);
            if (code) rejected.push({ field: "alight", code });
            else {
              alightPoint = point;
              alightSet = {
                observedAt: newAt,
                stopId: newStop,
                mode: modeFor({ memory: alightRow.mode === "memory", observedAt: newAt, recordedAt: alightRow.recordedAt }),
                ...CLEARED_DEDUCTION,
              };
            }
          }
        }
      }

      // Mudar a hora de um embarque que já tem descida: a mesma conferência (§3.3). Embarque que vira órfão não se confere.
      if (timeChanged && alightRow && !becomesPassed && network) {
        let preview: Deduction | null = null;
        try {
          preview = await deduce({ ...factOfRow(row), observedAt: nextAt, observedEndAt: nextEnd }, network, null);
        } catch {
          preview = null; // sem cálculo agora: a mudança passa e a fila refaz
        }
        if (preview?.matchStatus === "auto" && preview.patternId !== null && preview.position !== null) {
          const stored = passageOfRow(alightRow);
          const alight = alightPoint ?? { patternId: stored?.patternId ?? null, position: stored?.position ?? null, observedAt: alightRow.observedAt };
          const code = checkAlightEdit({ patternId: preview.patternId, position: preview.position, observedAt: nextAt }, alight);
          if (code) {
            rejected.push({ field: "observedAt", code });
            dropTime();
          }
        }
      }

      // Nota, memória e modo (D-055, D-067): o modo só se refaz quando a hora ou a memória mudam.
      if (patch.note !== undefined) {
        const note = patch.note === "" ? null : patch.note;
        if (note !== row.note) set.note = note;
      }
      const memoryWas = row.mode === "memory";
      const memoryNow = patch.memory !== undefined ? patch.memory : memoryWas;
      if (timeChanged || memoryNow !== memoryWas) {
        const mode = modeFor({ memory: memoryNow, observedAt: nextAt, recordedAt: row.recordedAt });
        if (mode !== row.mode) set.mode = mode;
      }
      if (timeChanged) {
        set.observedAt = nextAt;
        set.observedEndAt = nextEnd;
      }
      const refact = timeChanged || stopChanged;
      if (stopChanged) set.stopId = patch.stopId!;
      if (refact) Object.assign(set, CLEARED_DEDUCTION); // D-097: a escolha `manual` cai e tudo se recalcula
      if (kindChange) set.kind = kindChange;

      const createdRideIds: string[] = [];
      const touchesRide = kindChange !== null;
      if (Object.keys(set).length === 0 && alightSet === null && !touchesRide) {
        return { changed: false, rejected, token: null };
      }

      await inTransaction(async () => {
        if (kindChange === "passed" && ownRide) {
          // Embarquei → vi passar: o `ride` fecha como `dismissed` e a descida deixa de valer (D-099).
          await db.update(ride).set({ status: "dismissed", alightingObservationId: null, updatedAt: at }).where(eq(ride.id, ownRide.id));
          if (alightRow) await db.update(observation).set({ deletedAt: at, updatedAt: at }).where(eq(observation.id, alightRow.id));
        } else if (kindChange === "boarded") {
          // Vi passar → embarquei: `ride` novo, já `closed`, sem cartão "Em viagem"; o `dismissed` antigo sai (D-099).
          if (parent && parent.status === "dismissed") {
            await db.update(ride).set({ deletedAt: at, updatedAt: at }).where(eq(ride.id, parent.id));
          }
          const rideId = newId(at);
          createdRideIds.push(rideId);
          await db.insert(ride).values({
            id: rideId,
            createdAt: at,
            updatedAt: at,
            source: "user",
            boardingObservationId: row.id,
            alightingObservationId: null,
            tripId: row.matchStatus === "auto" || row.matchStatus === "manual" ? row.tripId : null,
            status: "closed",
          });
          set.rideId = rideId;
        }
        if (Object.keys(set).length > 0) {
          await db.update(observation).set({ ...set, updatedAt: at }).where(eq(observation.id, row.id));
        }
        if (refact && ownRide && !becomesPassed) {
          await db.update(ride).set({ tripId: null, updatedAt: at }).where(eq(ride.id, ownRide.id));
        }
        if (alightSet && alightRow) {
          await db.update(observation).set({ ...alightSet, updatedAt: at }).where(eq(observation.id, alightRow.id));
        }
      });

      // A dedução depois do fato (T-22): se o cálculo falhar, o fato fica salvo e a fila refaz.
      if (network) {
        const redo = async (observationId: string) => {
          const fresh = await observationById(observationId);
          if (!fresh || fresh.matchStatus === "manual") return;
          try {
            await deduceOne(fresh, network, at);
          } catch {
            /* a fila refaz na próxima vez */
          }
        };
        if (refact) await redo(row.id);
        if (alightRow && !becomesPassed && (timeChanged || alightSet)) await redo(alightRow.id);
      }

      return { changed: true, rejected, token: await tokenSince(before, createdRideIds) };
    });
  }

  /**
   * TL-09: escolhe a passagem de um registro `ambiguous` ou `orphan`. Fica `manual`, com o desvio como é (+18), entra na
   * estimativa (D-022) e limpa a marca "Não sei". Outra `lineId` muda o fato (`line_id`) e vale o mesmo caminho.
   * `serviceDate` é o dia de serviço da passagem escolhida (hoje ou ontem, como na lista das opções).
   */
  function chooseManual(
    id: string,
    input: { tripId: string; position: number; serviceDate: string; lineId?: string },
    at: number,
  ): Promise<ManualResult> {
    return enqueue(async (): Promise<ManualResult> => {
      const row = await observationById(id);
      if (!row) throw new Error("registro não encontrado");
      const network = deps.network();
      const snapshot = deps.snapshot();
      if (!network || !snapshot) return { ok: false, problem: "horários ainda não carregaram" };
      const trip = network.trips.find((t) => t.id === input.tripId);
      const pattern = trip ? network.patterns.find((p) => p.id === trip.patternId) : undefined;
      const lineId = input.lineId ?? row.lineId;
      if (!trip || !pattern || pattern.lineId !== lineId) return { ok: false, problem: "viagem fora da linha" };
      if (pattern.stops.find((s) => s.position === input.position)?.stopId !== row.stopId) return { ok: false, problem: "a passagem não é deste ponto" };
      const base = baseTimeAt(trip, input.position);
      const patternStopId = snapshot.patternStopIds.get(patternStopKey(pattern.id, input.position));
      const instant = matchInstant(row);
      const minute = serviceMinuteOn(input.serviceDate, instant);
      if (!base || patternStopId === undefined || minute === null) return { ok: false, problem: "passagem sem horário no dia" };
      const observedMinute = minute + (((instant % 60_000) + 60_000) % 60_000) / 60_000;

      const parent = row.rideId ? await rideById(row.rideId) : undefined;
      const ownRide = parent !== undefined && parent.boardingObservationId === row.id ? parent : undefined;
      const alightRow = ownRide ? await alightRowOf(ownRide) : undefined;
      if (alightRow && lineId !== row.lineId) return { ok: false, problem: "alight_conflict" };
      // Invariante 5 com a descida (ou com o embarque, se este registro é a descida).
      const boardingRow = row.kind === "alighted" && parent ? await observationById(parent.boardingObservationId) : undefined;
      const chosen = { patternId: pattern.id, position: input.position, observedAt: row.observedAt };
      if (alightRow) {
        const stored = passageOfRow(alightRow);
        const code = checkAlightEdit(chosen, { patternId: stored?.patternId ?? null, position: stored?.position ?? null, observedAt: alightRow.observedAt });
        if (code) return { ok: false, problem: code };
      } else if (boardingRow) {
        const code = checkAlightEdit(boardPointOf(boardingRow, boardingRow.observedAt), chosen);
        if (code) return { ok: false, problem: code };
      }

      const before = await captureBefore([row.id, alightRow?.id], [parent?.id]);
      await inTransaction(async () => {
        await db
          .update(observation)
          .set({
            lineId,
            serviceDate: input.serviceDate,
            serviceMinute: Math.floor(observedMinute),
            patternStopId,
            tripId: trip.id,
            matchStatus: "manual",
            deviationMin: observedMinute - base.minute,
            matchRuleVersion: MATCH_RULE_VERSION,
            reviewDismissedAt: null,
            updatedAt: at,
          })
          .where(eq(observation.id, row.id));
        if (ownRide) await db.update(ride).set({ tripId: trip.id, updatedAt: at }).where(eq(ride.id, ownRide.id));
      });
      // A descida se apoia na viagem do embarque (D-071): refaz, a menos que ela mesma seja uma escolha sua.
      if (alightRow) {
        const fresh = await observationById(alightRow.id);
        if (fresh && fresh.matchStatus !== "manual") {
          try {
            await deduceOne(fresh, network, at);
          } catch {
            /* a fila refaz na próxima vez */
          }
        }
      }
      return { ok: true, token: await tokenSince(before) };
    });
  }

  /**
   * "Não sei" (D-057): grava `review_dismissed_at`; o registro continua órfão ou ambíguo, fora da estimativa. Reabrir é
   * abrir a TL-09 de novo; `chooseManual` e a edição da hora limpam a marca. `null` se o registro não precisa de conferência.
   */
  function dismissReview(id: string, at: number): Promise<EditToken | null> {
    return enqueue(async () => {
      const row = await observationById(id);
      if (!row) throw new Error("registro não encontrado");
      if (row.matchStatus !== "ambiguous" && row.matchStatus !== "orphan") return null;
      const before = await captureBefore([row.id], []);
      await db.update(observation).set({ reviewDismissedAt: at, updatedAt: at }).where(eq(observation.id, row.id));
      return tokenSince(before);
    });
  }

  /**
   * Apagar (D-098, D-052): exclusão lógica. Embarque com descida apaga o par e o `ride` (`pair: true`); embarque sem
   * descida apaga o registro e o `ride`; só a descida deixa o embarque e o `ride` fica `closed` sem descida, sem
   * reabrir o cartão "Em viagem". Sai da estimativa e da fila de conferir (o filtro `deleted_at` já faz isso).
   */
  function remove(id: string, at: number): Promise<{ pair: boolean; token: EditToken }> {
    return enqueue(async () => {
      const row = await observationById(id);
      if (!row) throw new Error("registro não encontrado");
      const parent = row.rideId ? await rideById(row.rideId) : undefined;
      const isAlight = row.kind === "alighted";
      const ownRide = parent !== undefined && parent.boardingObservationId === row.id ? parent : undefined;
      const alightRow = ownRide ? await alightRowOf(ownRide) : undefined;
      const before = await captureBefore([row.id, alightRow?.id], [parent?.id]);
      await inTransaction(async () => {
        await db.update(observation).set({ deletedAt: at, updatedAt: at }).where(eq(observation.id, row.id));
        if (alightRow) await db.update(observation).set({ deletedAt: at, updatedAt: at }).where(eq(observation.id, alightRow.id));
        if (ownRide) await db.update(ride).set({ deletedAt: at, updatedAt: at }).where(eq(ride.id, ownRide.id));
        else if (isAlight && parent) {
          await db.update(ride).set({ alightingObservationId: null, status: "closed", updatedAt: at }).where(eq(ride.id, parent.id));
        }
      });
      return { pair: alightRow !== undefined, token: await tokenSince(before) };
    });
  }

  /**
   * Desfazer das operações acima: devolve **exatamente** as linhas do token, com `updated_at = at` (nunca o antigo: a
   * junção do backup decide por `updated_at`, D-085), e apaga os `ride` que a operação criou. Não toca em mais nada.
   */
  function restore(token: EditToken, at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        for (const { id, ...rest } of token.observations) {
          await db.update(observation).set({ ...rest, updatedAt: at }).where(eq(observation.id, id));
        }
        for (const { id, ...rest } of token.rides) {
          await db.update(ride).set({ ...rest, updatedAt: at }).where(eq(ride.id, id));
        }
        for (const id of token.createdRideIds) {
          await db.update(ride).set({ deletedAt: at, updatedAt: at }).where(eq(ride.id, id));
        }
      }),
    );
  }

  /** Tudo que as telas leem: os registros e as viagens vivos. Pouca coisa (uns 10 registros por dia). */
  async function load(): Promise<{ observations: ObservationRow[]; rides: RideRow[] }> {
    const [observations, rides] = await Promise.all([selectLive(db, observation), selectLive(db, ride)]);
    return { observations, rides };
  }

  /** Roda `job` na mesma fila das gravações (a importação do backup e o seu Desfazer: uma transação por vez). */
  function exclusive<T>(job: () => Promise<T>): Promise<T> {
    return enqueue(job);
  }

  return { board, undoBoard, alight, undoAlight, notBoarded, undoNotBoarded, dismiss, undoDismiss, expire, refreshDeductions, rematchWhere, edit, chooseManual, dismissReview, remove, restore, load, exclusive };
}

export type Registro = ReturnType<typeof createRegistro>;
