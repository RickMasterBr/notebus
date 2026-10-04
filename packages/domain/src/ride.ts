/**
 * Ciclo do `ride` (E-03 §4) como funções puras: cada uma recebe o estado e devolve o novo, sem banco.
 *
 *   open ──Desci aqui──▶ closed (com descida)
 *   open ──Não embarquei──▶ dismissed (o embarque vira "vi passar", D-073)
 *   open ──Dispensar──▶ closed (sem descida)
 *   open ──fim do percurso + 30 min (Q-82)──▶ closed (sem descida)
 *   open ──3 h depois do embarque, sem viagem conhecida (Q-85)──▶ closed (sem descida)
 *   open ──novo embarque──▶ closed (sem descida), e o novo abre (T-26)
 */
import { addDays, lisbonWallClock } from "./calendar.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { checkRide } from "./invariants.ts";
import { baseTimeAt, type TripData } from "./passages.ts";

export type RideStatus = "open" | "closed" | "dismissed";

/** O que o `ride` guarda (tabela `ride`). */
export interface RideState {
  id: string;
  boardingObservationId: string;
  alightingObservationId: string | null;
  tripId: string | null;
  status: RideStatus;
}

/** Um lado da viagem para o invariante 5: a passagem deduzida e o instante. */
export interface RidePoint {
  patternId: string;
  position: number;
  observedAt: number;
}

function assertOpen(ride: RideState, action: string): void {
  if (ride.status !== "open") throw new Error(`ride ${ride.id}: "${action}" só com o ride aberto (está ${ride.status})`);
}

/** Um `ride` novo, aberto, para um embarque. */
export function openRide(id: string, boardingObservationId: string, tripId: string | null): RideState {
  return { id, boardingObservationId, alightingObservationId: null, tripId, status: "open" };
}

/** "Desci aqui": liga a descida e fecha. Lança erro se o invariante 5 falha (percurso, posição ou hora). */
export function alightRide(ride: RideState, alightingObservationId: string, board: RidePoint, alight: RidePoint): RideState {
  assertOpen(ride, "Desci aqui");
  const problem = checkRide(board, alight);
  if (problem) throw new Error(`ride ${ride.id}: ${problem} (invariante 5)`);
  return { ...ride, alightingObservationId, status: "closed" };
}

/** "Não embarquei" (D-073): o `ride` vira `dismissed` e o registro de embarque passa a `passed` ("vi passar"). */
export function notBoarded(ride: RideState): { ride: RideState; boardingKind: "passed" } {
  assertOpen(ride, "Não embarquei");
  return { ride: { ...ride, status: "dismissed" }, boardingKind: "passed" };
}

/** "Dispensar": fecha sem descida. */
export function dismissRide(ride: RideState): RideState {
  assertOpen(ride, "Dispensar");
  return { ...ride, status: "closed" };
}

/**
 * A viagem já passou do fim do percurso + a folga (`rideEndToleranceMinutes`, 30 min)? `trip` é a viagem do `ride`, `serviceDate` o seu dia de serviço,
 * `now` o instante (convertido para o fuso da rede, invariante 7). O fim é o horário-base da última posição.
 */
export function rideExpired(trip: TripData, serviceDate: string, now: number, config: DomainConfig = DOMAIN_CONFIG): boolean {
  const end = baseTimeAt(trip, trip.lastPosition)!.minute + config.rideEndToleranceMinutes;
  const clock = lisbonWallClock(now);
  if (clock.date < serviceDate) return false;
  // Minuto de serviço do "agora" no dia de serviço do ride: o de hoje, ou + 1440 no dia seguinte (D-016).
  if (clock.date === serviceDate) return clock.minute > end;
  if (clock.date === addDays(serviceDate, 1)) return clock.minute + 1440 > end;
  return true;
}

/** Fecha sozinho (sem descida) se a viagem passou do fim + a folga; senão devolve o mesmo `ride`. */
export function expireRide(ride: RideState, trip: TripData, serviceDate: string, now: number, config: DomainConfig = DOMAIN_CONFIG): RideState {
  if (ride.status !== "open" || !rideExpired(trip, serviceDate, now, config)) return ride;
  return { ...ride, status: "closed" };
}

/**
 * `ride` sem viagem conhecida (registro `orphan` sem candidato, Q-85): não há fim de percurso, então fecha sozinho
 * `rideWithoutTripHours` (3 h) depois do embarque. Às 3 h exatas ainda não; é preciso passar.
 */
export function expireRideWithoutTrip(ride: RideState, boardedAt: number, now: number, config: DomainConfig = DOMAIN_CONFIG): RideState {
  if (ride.status !== "open" || now - boardedAt <= config.rideWithoutTripHours * 3_600_000) return ride;
  return { ...ride, status: "closed" };
}

/** Novo embarque (T-26): todo `ride` aberto fecha sem descida e o novo abre. */
export function boardWithOpenRides(openRides: readonly RideState[], next: RideState): { closed: RideState[]; opened: RideState } {
  return {
    closed: openRides.filter((r) => r.status === "open").map((r) => ({ ...r, status: "closed" as const })),
    opened: next,
  };
}
