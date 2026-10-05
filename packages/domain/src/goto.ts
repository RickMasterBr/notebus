/**
 * "Ir para X" (E-05 §3, Fase 1 §4.5, D-034, D-100): de cada opção de ônibus as próximas viagens viáveis, com "sair às",
 * "esteja no ponto às", "chega ~" e "até"; a opção a pé; a ordem e o corte em `maxCards`.
 *
 * Puro: sem banco, sem relógio (o "agora" chega como argumento) e sem texto de tela. Quem chama passa só as viagens
 * que circulam no dia de serviço dado (`tripsRunningOn`) e os registros da linha. Todos os horários devolvidos são
 * minutos de serviço (D-016) **inteiros**, já arredondados para mostrar (D-092).
 */

import { addDays, lisbonWallClock } from "./calendar.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { checkBusOption } from "./invariants.ts";
import { baseTimeAt, displayBeAtStop, displayCenter, expectedTime, type ExpectedTime, type PassageRecord, type PatternData, type TripData } from "./passages.ts";
import type { DayTypeCode } from "./seedFormat.ts";

// ─── Entrada ────────────────────────────────────────────────────────────────

/** Tempo a pé em minutos: faixa "10 a 12" = `{ min: 10, max: 12 }`; sem faixa, `max` é `null`. */
export interface WalkRange {
  min: number;
  max: number | null;
}

/** Uma opção de ônibus de um trajeto: percurso, posições de embarque e descida e os tempos a pé nas duas pontas. */
export interface BusOption {
  /** Identificador de quem chama (devolvido em cada candidato). */
  id: string;
  pattern: PatternData;
  boardPosition: number;
  alightPosition: number;
  walkToBoard: WalkRange;
  walkAfterAlight: WalkRange;
  /** Os deslocamentos já registrados neste trecho (mesmo embarque e mesma descida), em minutos (UC-18). */
  rideMinutes: readonly number[];
}

/** A opção a pé: um número só (`walk_minutes`). */
export interface WalkOption {
  id: string;
  walkMinutes: number;
}

export interface GotoInput {
  busOptions: readonly BusOption[];
  walk: WalkOption | null;
  /** As viagens que circulam no dia de serviço `serviceDate` (`tripsRunningOn`). */
  trips: readonly TripData[];
  /** Registros da linha, de qualquer viagem e ponto (como em `expectedTime`). */
  records: readonly PassageRecord[];
  /** "Agora" (epoch ms UTC). */
  now: number;
  /** O dia de serviço das `trips`, o seu tipo de dia e o início da vigência da tabela de cada viagem. */
  serviceDate: string;
  dayType: DayTypeCode;
  validFrom: (tripId: string) => string | null;
  config?: DomainConfig;
}

// ─── Saída ──────────────────────────────────────────────────────────────────

export interface BusCandidate {
  kind: "bus";
  optionId: string;
  tripId: string;
  patternId: string;
  /** "Esteja no ponto às". */
  beAtStop: number;
  /** "Sair às" (a pé até o embarque, o maior valor da faixa). */
  leaveAt: number;
  /** "Chega ~". */
  arriveAt: number;
  /** "Até". */
  until: number;
  /** O trecho usou o tempo real dos deslocamentos (§3.2) em vez da descida esperada. */
  usedRideTimes: boolean;
}

export interface WalkCandidate {
  kind: "walk";
  optionId: string;
  leaveAt: number;
  arriveAt: number;
  until: number;
}

export type GotoCandidate = BusCandidate | WalkCandidate;

// ─── B1. Tempo a pé com faixa (D-100) ───────────────────────────────────────

/** `leave` e `until` usam o maior valor da faixa; `mid` o meio. Sem faixa, os três são `min`. */
export function walkTimes(range: WalkRange): { leave: number; mid: number; until: number } {
  const max = range.max ?? range.min;
  return { leave: max, mid: (range.min + max) / 2, until: max };
}

// ─── B3. Tempo real de trecho (Fase 1 §4.5, passo 2) ────────────────────────

/** Mediana simples; com número par, a média dos dois do meio. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Tempo do trecho: `(n · mediana + k · oficial) / (n + k)`, `k = shrinkK`. Sem deslocamentos (`n = 0`) devolve `null`:
 * quem chama usa então o horário esperado na descida.
 */
export function shrunkRideMinutes(rideMinutes: readonly number[], official: number, config: DomainConfig = DOMAIN_CONFIG): number | null {
  const n = rideMinutes.length;
  if (n === 0) return null;
  return (n * median(rideMinutes) + config.shrinkK * official) / (n + config.shrinkK);
}

// ─── B2. Candidatos de uma opção de ônibus ──────────────────────────────────

/** Minuto de serviço de `now` no dia de serviço `serviceDate` (depois da meia-noite passa de 1440, D-016). */
function nowServiceMinute(now: number, serviceDate: string): number {
  const clock = lisbonWallClock(now);
  let date = serviceDate;
  let offset = 0;
  while (date < clock.date) {
    date = addDays(date, 1);
    offset += 1440;
  }
  while (date > clock.date) {
    date = addDays(date, -1);
    offset -= 1440;
  }
  return clock.minute + offset;
}

/**
 * As próximas viagens viáveis de uma opção de ônibus, em ordem de horário no embarque (no máximo `tripsPerOption`).
 * Lança erro se a descida não vem depois do embarque (`checkBusOption`).
 */
export function busCandidates(option: BusOption, input: GotoInput): BusCandidate[] {
  const config = input.config ?? DOMAIN_CONFIG;
  const problem = checkBusOption(
    { patternId: option.pattern.id, position: option.boardPosition },
    { patternId: option.pattern.id, position: option.alightPosition },
  );
  if (problem) throw new Error(`opção ${option.id}: ${problem}`);
  const boardStop = option.pattern.stops.find((s) => s.position === option.boardPosition);
  const alightStop = option.pattern.stops.find((s) => s.position === option.alightPosition);
  if (!boardStop || !alightStop) throw new Error(`opção ${option.id}: posição fora do percurso ${option.pattern.id}`);

  const toBoard = walkTimes(option.walkToBoard);
  const afterAlight = walkTimes(option.walkAfterAlight);
  const nowMinute = nowServiceMinute(input.now, input.serviceDate);

  const expectedAt = (trip: TripData, position: number, stopId: string): ExpectedTime | null => {
    const base = baseTimeAt(trip, position);
    if (!base) return null;
    const target = { tripId: trip.id, patternId: trip.patternId, position, stopId, dayType: input.dayType, validFrom: input.validFrom(trip.id) };
    return expectedTime(base, input.records, { target, now: input.now, config });
  };

  const found: { board: ExpectedTime; candidate: BusCandidate }[] = [];
  for (const trip of input.trips) {
    if (trip.patternId !== option.pattern.id) continue;
    const board = expectedAt(trip, option.boardPosition, boardStop.stopId);
    const alight = expectedAt(trip, option.alightPosition, alightStop.stopId);
    if (!board || !alight) continue;
    const beAtStop = displayBeAtStop(board.beAtStop);
    const leaveAt = Math.floor(beAtStop - toBoard.leave);
    if (leaveAt < nowMinute) continue;
    const segment = shrunkRideMinutes(option.rideMinutes, alight.center - board.center, config);
    const arrive = segment === null ? alight.center : board.center + segment;
    const until = segment === null ? alight.rangeEnd : board.rangeEnd + segment;
    found.push({
      board,
      candidate: {
        kind: "bus",
        optionId: option.id,
        tripId: trip.id,
        patternId: trip.patternId,
        beAtStop,
        leaveAt,
        arriveAt: displayCenter(arrive + afterAlight.mid),
        until: displayCenter(until + afterAlight.until),
        usedRideTimes: segment !== null,
      },
    });
  }
  found.sort((a, b) => a.board.center - b.board.center);
  return found.slice(0, config.tripsPerOption).map((f) => f.candidate);
}

// ─── B4 e B5. Ordenação e lista final ───────────────────────────────────────

/**
 * A lista de cartões de "Ir para X" (D-034): ônibus por `chega ~` (empate: quem deixa sair mais tarde); a pé antes do
 * primeiro ônibus que ela vence por `walkBeatsBusMinutes` ou mais (inclusive), senão no fim; no máximo `maxCards`
 * no total, o cartão a pé nunca cortado (corta-se ônibus do fim). Lista vazia é resposta válida.
 */
export function gotoCards(input: GotoInput): GotoCandidate[] {
  const config = input.config ?? DOMAIN_CONFIG;
  const buses = input.busOptions
    .flatMap((o) => busCandidates(o, input))
    .sort((a, b) => a.arriveAt - b.arriveAt || b.leaveAt - a.leaveAt);
  if (!input.walk) return buses.slice(0, config.maxCards);

  const nowMinute = nowServiceMinute(input.now, input.serviceDate);
  const arriveAt = nowMinute + input.walk.walkMinutes;
  const walk: WalkCandidate = { kind: "walk", optionId: input.walk.id, leaveAt: nowMinute, arriveAt, until: arriveAt };
  const kept = buses.slice(0, Math.max(config.maxCards - 1, 0));
  const first = kept.findIndex((b) => b.arriveAt - arriveAt >= config.walkBeatsBusMinutes);
  const at = first === -1 ? kept.length : first;
  return [...kept.slice(0, at), walk, ...kept.slice(at)];
}
