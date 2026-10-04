/**
 * O cartão "Em viagem" e a lista do "Desci aqui" (E-03 bloco 2; plano §4; D-070, D-071, D-075). Puro: sem banco, sem
 * relógio (o instante vem de quem chama) e sem texto de tela.
 *
 * A viagem de um `ride` sai da dedução do **embarque**, refeita aqui na memória (`deduceObservation` é função só do fato
 * e da rede: mesma entrada, mesmo resultado), então o cartão não espera a dedução gravada. Sem casamento (`orphan` ou
 * `ambiguous`) vale o candidato mais perto que o domínio devolve (`nearest`); sem candidato nenhum, o cartão fica sem
 * "→ destino" e sem lista. Um embarque `manual` (E-04) ainda não existe: quando existir, a viagem dele vem do banco.
 */
import {
  type Deduction,
  type ExpectedTime,
  type MatchCandidate,
  type MatchNetwork,
  type ObservationFact,
  type PassageRecord,
  addDays,
  baseTimeAt,
  deduceObservation,
  displayCenter,
  expectedTime,
  inRideExpected,
  latestRideDeviation,
  lisbonWallClock,
  passageInfo,
  timepointPositions,
} from "@notebus/domain";
import { type Ahead, buildAhead } from "./ahead";
import { passageTarget } from "./records";
import type { ObservationRow } from "./registro";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

type BoardingFact = Pick<ObservationRow, "stopId" | "lineId" | "observedAt" | "observedEndAt" | "kind" | "mode">;

export const factOf = (o: BoardingFact): ObservationFact => ({
  stopId: o.stopId,
  lineId: o.lineId,
  observedAt: o.observedAt,
  observedEndAt: o.observedEndAt,
  kind: o.kind,
  mode: o.mode,
});

/** A dedução do embarque, na memória (o `OngoingRide` não existe para o embarque que abre o `ride`). */
export function deduceBoarding(obs: BoardingFact, network: MatchNetwork): Deduction {
  return deduceObservation(factOf(obs), network, null);
}

/** A passagem do embarque: a viagem casada, ou a mais perto quando não casou. `null` se a linha não passa no ponto. */
export function resolveBoarding(obs: BoardingFact, network: MatchNetwork): MatchCandidate | null {
  return deduceBoarding(obs, network).nearest;
}

/**
 * O "→ destino" de uma passagem: o **próximo ponto de controle** depois da posição (a mesma regra do "destino" da TL-02,
 * `passageInfo`). A viagem das 08:10 da L1 é circular (sai e termina no Estádio): o destino de quem embarca na Arrabalde é
 * o Campus 2 ULO, não o Estádio. Sem ponto de controle adiante, o fim da viagem.
 */
export function nextDestination(
  data: ScheduleSnapshot,
  patternId: string,
  tripId: string,
  position: number,
): { position: number; name: string | null; minute: number } | null {
  const trip = data.trips.find((t) => t.id === tripId);
  const pattern = data.patterns.find((p) => p.id === patternId);
  if (!trip || !pattern) return null;
  const timepoints = timepointPositions(pattern, data.trips.filter((t) => t.patternId === pattern.id));
  const info = passageInfo(pattern, timepoints, position);
  const at = info.destination !== null && info.destination <= trip.lastPosition ? info.destination : trip.lastPosition;
  const base = baseTimeAt(trip, at);
  if (!base) return null;
  const stopId = pattern.stops.find((s) => s.position === at)?.stopId;
  return { position: at, name: stopId === undefined ? null : (data.stopNames.get(stopId) ?? null), minute: base.minute };
}

/** Minuto de serviço do instante num dia de serviço (hoje, ou + 1440 depois da meia-noite, D-016); `null` se longe. */
export function serviceMinuteOn(serviceDate: string, instant: number): number | null {
  const clock = lisbonWallClock(instant);
  if (clock.date === serviceDate) return clock.minute;
  if (clock.date === addDays(serviceDate, 1)) return clock.minute + 1440;
  return null;
}

export interface TripCardModel {
  rideId: string;
  line: { code: string; color: string } | null;
  /** O próximo ponto de controle depois do embarque ("→ Campus 2 ULO"); `null` sem viagem conhecida. */
  destination: string | null;
  /** "embarcou 08:12 · Arrabalde da Ponte". */
  boardedTime: string;
  stopName: string;
  /** Chegada prevista a esse destino, pelo atraso da própria viagem (D-070); `null` sem viagem. */
  eta: { time: string; approximate: boolean } | null;
  /** A viagem e a passagem do embarque; `null` sem viagem conhecida. */
  trip: { tripId: string; patternId: string; boardPosition: number; serviceDate: string } | null;
  /** Atraso que a viagem mostrou hoje (o do embarque), ou `null` se o embarque não casou (`auto`). */
  rideDeviation: number | null;
  /** Hora de saída da viagem pela tabela ("viagem das 08:10"), sem o atraso de hoje; `null` sem viagem. */
  tripStart: string | null;
  /** "Daqui para a frente" a partir do embarque, com os horários deslocados pelo atraso da viagem (D-075). */
  ahead: Ahead | null;
}

/**
 * O cartão do `ride` aberto. `records` são os registros aceitos (para o histórico do destino); `boarding` o embarque.
 * `null` se a linha ou o ponto sumiram dos horários (importação trocada): o cartão não aparece.
 */
export function buildTripCard(
  rideId: string,
  boarding: BoardingFact,
  data: ScheduleSnapshot,
  network: MatchNetwork,
  records: readonly PassageRecord[],
  now: number,
): TripCardModel | null {
  const stopName = data.stopNames.get(boarding.stopId);
  const line = data.lineInfo.get(boarding.lineId) ?? null;
  if (stopName === undefined) return null;
  const deduction = deduceBoarding(boarding, network);
  const start = deduction.nearest;
  const rideDeviation = deduction.matchStatus === "auto" ? deduction.deviation : null;
  const boardedTime = clockText(lisbonWallClock(boarding.observedAt).minute);
  const base: Omit<TripCardModel, "destination" | "eta" | "trip" | "ahead" | "tripStart"> = {
    rideId,
    line: line ? { code: line.code, color: line.color } : null,
    boardedTime,
    stopName,
    rideDeviation,
  };
  const trip = start ? data.trips.find((t) => t.id === start.tripId) : undefined;
  const pattern = trip ? data.patterns.find((p) => p.id === trip.patternId) : undefined;
  if (!start || !trip || !pattern) return { ...base, destination: null, eta: null, trip: null, tripStart: null, ahead: null };

  const next = nextDestination(data, pattern.id, trip.id, start.position);
  const endBase = next ? baseTimeAt(trip, next.position) : null;
  const startBase = baseTimeAt(trip, trip.firstPosition);
  const tripStart = startBase ? clockText(displayCenter(startBase.minute)) : null;
  const target = next ? passageTarget(data, trip.id, next.position, start.serviceDate) : null;
  let eta: TripCardModel["eta"] = null;
  if (endBase && target) {
    const historical: ExpectedTime = expectedTime(endBase, records, { target, now });
    const expected = rideDeviation === null ? historical : inRideExpected(endBase, historical, rideDeviation).expected;
    eta = { time: clockText(displayCenter(expected.center)), approximate: expected.confidence !== "high" };
  }
  const ahead = buildAhead(trip.id, start.position, data, { shiftMinutes: rideDeviation ?? 0 });
  return {
    ...base,
    destination: next?.name ?? null,
    eta,
    trip: { tripId: trip.id, patternId: pattern.id, boardPosition: start.position, serviceDate: start.serviceDate },
    rideDeviation,
    tripStart,
    // O centro de cada paragem é `base + atraso da viagem` (D-070): o deslocamento da lista é o próprio atraso. A hora
    // de saída da viagem ("viagem das 08:10") é a da tabela, não a deslocada.
    ahead: ahead && tripStart !== null ? { ...ahead, tripStart } : ahead,
  };
}

/** Uma paragem da lista "Onde você desceu?". */
export interface AlightRow {
  position: number;
  stopId: string;
  name: string;
  /** "HH:MM", o centro ao minuto mais próximo (D-092). */
  time: string;
  /** Horário interpolado: aparece com `~` (4.6 §4). */
  approximate: boolean;
  /** 1ª, 2ª… vez deste ponto no percurso; `null` se passa uma vez só (D-094). */
  number: number | null;
  /** Minutos de serviço do centro, com decimais (a ordem da lista). */
  minute: number;
}

/**
 * As próximas paragens da viagem (depois do embarque, até o fim do percurso), com a hora prevista **pelo atraso da
 * viagem** (D-070), a mais provável agora primeiro: a de centro mais perto do instante; empate, a mais adiante.
 * Lista vazia sem viagem conhecida.
 */
export function buildAlightRows(card: TripCardModel, data: ScheduleSnapshot, now: number): AlightRow[] {
  if (!card.trip) return [];
  const trip = data.trips.find((t) => t.id === card.trip!.tripId);
  const pattern = trip ? data.patterns.find((p) => p.id === trip.patternId) : undefined;
  if (!trip || !pattern) return [];
  const timepoints = timepointPositions(pattern, data.trips.filter((t) => t.patternId === pattern.id));
  const shift = card.rideDeviation ?? 0;
  const current = serviceMinuteOn(card.trip.serviceDate, now);
  const rows: AlightRow[] = [];
  for (const s of [...pattern.stops].sort((a, b) => a.position - b.position)) {
    if (s.position <= card.trip.boardPosition || s.position > trip.lastPosition) continue;
    const base = baseTimeAt(trip, s.position);
    if (!base) continue;
    const minute = base.minute + shift;
    rows.push({
      position: s.position,
      stopId: s.stopId,
      name: data.stopNames.get(s.stopId) ?? "",
      time: clockText(displayCenter(minute)),
      approximate: base.kind === "interpolated",
      number: passageInfo(pattern, timepoints, s.position).number,
      minute,
    });
  }
  if (current === null) return rows;
  return rows.sort((a, b) => Math.abs(a.minute - current) - Math.abs(b.minute - current) || b.position - a.position);
}

/** O registro aberto do `ride` na lista de registros, se ainda existir. */
export function boardingOf(ride: { boardingObservationId: string }, observations: readonly ObservationRow[]): ObservationRow | undefined {
  return observations.find((o) => o.id === ride.boardingObservationId);
}
