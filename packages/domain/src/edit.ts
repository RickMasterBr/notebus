/**
 * Editar, conferir e corrigir registros (E-04 bloco 1): as funções puras que as telas TL-06 e TL-09 usam, sem banco,
 * sem relógio (o instante vem de quem chama) e sem texto de tela (devolvem dados; as frases são do bloco 2).
 *
 * - `resolvePickedTime`: a hora do seletor vira a ocorrência mais recente no passado, até 24 h (Q-44, T-42).
 * - `intervalAround` e `modeFor`: o "mais ou menos" e o modo do registro (D-054, D-055, D-060, D-067).
 * - `previewMatch`: o casamento em rascunho da frase ao vivo da TL-06 (D-061, §3.6, T-33): o mesmo `matchObservation`.
 * - `verifyOptions`: as opções da TL-09 para a órfã e a ambígua (§4.3, D-058, D-059, D-072), nenhuma marcada.
 * - `checkAlightEdit`: o invariante 5 com código estável para a TL-06 (§3.3).
 */
import { addDays, lisbonInstants, lisbonWallClock } from "./calendar.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { checkRideCode, type RideProblemCode } from "./invariants.ts";
import {
  type MatchCandidate,
  type MatchNetwork,
  type ObservationFact,
  type OngoingRide,
  evaluatePassages,
  matchObservation,
} from "./matching.ts";
import {
  type BaseTime,
  type MatchStatus,
  type PassageInfo,
  type PatternData,
  type TripData,
  baseTimeAt,
  passageInfo,
  timepointPositions,
} from "./passages.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
// Mesma folga do casamento contra o erro de ponto flutuante da interpolação (um desvio de 15,0000001 é 15).
const EPS = 1e-6;

// ─── Hora do seletor, intervalo e modo ──────────────────────────────────────

/**
 * A hora do seletor nativo (que só mostra hora e minuto) vira o instante da **ocorrência mais recente no passado, até
 * 24 h** dessa hora no relógio de Lisboa (Q-44, A; invariante 7). Segundos 0. Nunca devolve instante futuro; a hora de
 * agora devolve agora (sem os segundos). `null` se a hora não existiu nesse intervalo (a hora que falta em março).
 */
export function resolvePickedTime(hour: number, minute: number, now: number, config: DomainConfig = DOMAIN_CONFIG): number | null {
  const today = lisbonWallClock(now).date;
  const earliest = now - config.pickedTimeLookbackHours * HOUR_MS;
  const found = [today, addDays(today, -1)]
    .flatMap((date) => lisbonInstants(date, hour * 60 + minute))
    .filter((instant) => instant <= now && instant > earliest);
  return found.length === 0 ? null : Math.max(...found);
}

/** "Mais ou menos" (D-060): o intervalo vai de `center − h` a `center + h`; o ponto médio continua o `center` (T-15). */
export function intervalAround(center: number, halfMinutes: number): { observedAt: number; observedEndAt: number } {
  return { observedAt: center - halfMinutes * MINUTE_MS, observedEndAt: center + halfMinutes * MINUTE_MS };
}

/**
 * Modo do registro (D-055, D-067): "de memória" ligado → `memory`; senão, hora diferente da do toque → `later`; senão
 * `live`. A hora do toque (`recordedAt`) nunca muda; a comparação é exata.
 */
export function modeFor(input: { memory: boolean; observedAt: number; recordedAt: number }): ObservationFact["mode"] {
  if (input.memory) return "memory";
  return input.observedAt !== input.recordedAt ? "later" : "live";
}

// ─── Casamento em rascunho (D-061, §3.6) ────────────────────────────────────

/** Tudo que a frase ao vivo da TL-06 precisa, em números. Nada é gravado. */
export interface MatchPreview {
  status: Exclude<MatchStatus, "manual">;
  /** `auto`: a passagem casada (viagem, posição, hora no ponto em `base`, desvio com decimais). Senão `null`. */
  chosen: MatchCandidate | null;
  /** `auto`: a hora de saída da viagem (o horário-base da primeira posição dela), minuto de serviço. */
  departureMinute: number | null;
  /** `orphan`: o par mais perto (`null` se a linha não passa no ponto). */
  nearest: MatchCandidate | null;
  /** `ambiguous`: os candidatos dentro da janela, do mais perto ao mais longe. */
  candidates: MatchCandidate[];
}

/** O minuto de serviço em que a viagem sai (horário-base da sua primeira posição); `null` se a viagem não existe. */
function departureOf(trip: TripData | undefined): number | null {
  return trip ? (baseTimeAt(trip, trip.firstPosition)?.minute ?? null) : null;
}

/**
 * O casamento de um registro ainda em rascunho: o **mesmo** `matchObservation` da dedução gravada, com a viagem em curso
 * (D-071) como em `deduceOne`. Valores de §3.6: 08:13 → viagem das 08:10, +1; 08:08 → −4; 08:03 → órfã (−9).
 */
export function previewMatch(
  draftFact: Pick<ObservationFact, "stopId" | "lineId" | "observedAt" | "observedEndAt">,
  network: MatchNetwork,
  ride: OngoingRide | null = null,
  config: DomainConfig = DOMAIN_CONFIG,
): MatchPreview {
  const match = matchObservation(draftFact, network, ride, config);
  const chosen = match.status === "auto" ? match.candidates[0]! : null;
  return {
    status: match.status,
    chosen,
    departureMinute: chosen ? departureOf(network.trips.find((t) => t.id === chosen.tripId)) : null,
    nearest: match.status === "orphan" ? match.nearest : null,
    candidates: match.status === "ambiguous" ? match.candidates : [],
  };
}

// ─── Opções da TL-09 (§4.3, D-058, D-059, D-072) ────────────────────────────

/** A descida do mesmo `ride`, como pista (D-059): só vale se ela casou (`auto` ou `manual`) com uma viagem. */
export interface AlightHint {
  tripId: string | null;
  matchStatus: MatchStatus | null;
  stopId: string;
  observedAt: number;
}

/** Uma passagem oferecida na TL-09: nomeada pela hora no ponto (D-058); a saída da viagem é detalhe. */
export interface VerifyPassage {
  lineId: string;
  tripId: string;
  patternId: string;
  position: number;
  serviceDate: string;
  /** Hora no ponto (minuto de serviço com decimais) e de onde ela vem. */
  base: BaseTime;
  /** Observado − base, com decimais (+18, −6,5). */
  deviation: number;
  /** Atraso ÷ 15, adiantamento ÷ 5 (T-13). */
  distance: number;
  /** Quando a viagem sai (primeira posição dela), minuto de serviço. */
  departureMinute: number | null;
  /** Número da passagem, origem e destino (D-094), com o ponto físico de cada ponta quando existe. */
  info: PassageInfo;
  originStopId: string | null;
  destinationStopId: string | null;
  /** Pista da descida (D-059): o ponto e a hora da descida que bate com esta viagem. */
  alightHint: { stopId: string; observedAt: number } | null;
}

export interface VerifyOptions {
  status: Exclude<MatchStatus, "manual">;
  /** Órfã: as duas vizinhas da hora anotada na mesma linha, por dia de serviço, até 30 min de desvio, por distância. */
  sameLine: VerifyPassage[];
  /** Órfã ou ambígua, "Ou foi outra linha?": uma passagem por linha, no mesmo ponto físico, a até 15 min. */
  otherLines: VerifyPassage[];
  /** Ambígua (D-072): cada candidato como passagem. */
  candidates: VerifyPassage[];
}

export interface VerifyContext {
  /** A viagem em curso (D-071), como na dedução: restringe os candidatos da ambígua. */
  ride?: OngoingRide | null;
  /** A descida do mesmo `ride`, se houver. */
  alight?: AlightHint | null;
}

/**
 * As opções da TL-09 para um registro `orphan` ou `ambiguous`, **sem nenhuma marcada** (a escolha é sua e vira `manual`).
 * Só dados (hora, desvio, distância, ids): as frases são do bloco 2. Pista da descida (D-059): se a descida do mesmo
 * deslocamento casou com a viagem X, X vem primeiro, com a pista; isto nunca escolhe nada sozinho.
 */
export function verifyOptions(
  fact: Pick<ObservationFact, "stopId" | "lineId" | "observedAt" | "observedEndAt">,
  network: MatchNetwork,
  context: VerifyContext = {},
  config: DomainConfig = DOMAIN_CONFIG,
): VerifyOptions {
  const match = matchObservation(fact, network, context.ride ?? null, config);
  const tripsById = new Map(network.trips.map((t) => [t.id, t]));
  const patternsById = new Map<string, PatternData>(network.patterns.map((p) => [p.id, p]));
  const timepointsOf = new Map<string, ReadonlySet<number>>();
  const timepointsFor = (pattern: PatternData): ReadonlySet<number> => {
    let found = timepointsOf.get(pattern.id);
    if (!found) {
      found = timepointPositions(pattern, network.trips.filter((t) => t.patternId === pattern.id));
      timepointsOf.set(pattern.id, found);
    }
    return found;
  };
  const hint = context.alight && (context.alight.matchStatus === "auto" || context.alight.matchStatus === "manual") ? context.alight : null;

  const passageOf = (c: MatchCandidate, lineId: string): VerifyPassage => {
    const pattern = patternsById.get(c.patternId)!;
    const info = passageInfo(pattern, timepointsFor(pattern), c.position);
    const stopAt = (position: number | null) => (position === null ? null : (pattern.stops.find((s) => s.position === position)?.stopId ?? null));
    return {
      lineId,
      tripId: c.tripId,
      patternId: c.patternId,
      position: c.position,
      serviceDate: c.serviceDate,
      base: c.base,
      deviation: c.deviation,
      distance: c.distance,
      departureMinute: departureOf(tripsById.get(c.tripId)),
      info,
      originStopId: stopAt(info.origin),
      destinationStopId: stopAt(info.destination),
      alightHint: hint && hint.tripId === c.tripId ? { stopId: hint.stopId, observedAt: hint.observedAt } : null,
    };
  };

  /** A viagem da descida primeiro (D-059); a ordem das demais não muda. */
  const hintFirst = (list: VerifyPassage[]): VerifyPassage[] => {
    const at = hint ? list.findIndex((p) => p.tripId === hint.tripId) : -1;
    return at > 0 ? [list[at]!, ...list.slice(0, at), ...list.slice(at + 1)] : list;
  };

  const otherLines = (): VerifyPassage[] => {
    const lineIds = new Set(network.patterns.filter((p) => p.lineId !== fact.lineId && p.stops.some((s) => s.stopId === fact.stopId)).map((p) => p.lineId));
    const out: VerifyPassage[] = [];
    for (const lineId of lineIds) {
      // `evaluatePassages` já ordena por distância; a primeira dentro da janela é a passagem mais perto desta linha.
      const near = evaluatePassages({ ...fact, lineId }, network, null, config).find((c) => Math.abs(c.deviation) <= config.verifyOtherLineWindowMinutes + EPS);
      if (near) out.push(passageOf(near, lineId));
    }
    return out.sort((a, b) => a.distance - b.distance || a.base.minute - b.base.minute);
  };

  if (match.status === "ambiguous") {
    return { status: "ambiguous", sameLine: [], otherLines: otherLines(), candidates: hintFirst(match.candidates.map((c) => passageOf(c, fact.lineId))) };
  }
  if (match.status === "auto") {
    return { status: "auto", sameLine: [], otherLines: [], candidates: [] };
  }

  // Órfã: por dia de serviço, a última passagem com base ≤ hora anotada (desvio ≥ 0) e a primeira com base > hora
  // anotada (desvio < 0). Cada dia de serviço olhado pelo casamento (hoje e ontem) tem as suas duas vizinhas.
  const evaluated = evaluatePassages(fact, network, null, config);
  const neighbours: MatchCandidate[] = [];
  for (const date of new Set(evaluated.map((c) => c.serviceDate))) {
    const day = evaluated.filter((c) => c.serviceDate === date);
    const before = day.filter((c) => c.deviation >= 0).sort((a, b) => a.deviation - b.deviation)[0];
    const after = day.filter((c) => c.deviation < 0).sort((a, b) => b.deviation - a.deviation)[0];
    for (const c of [before, after]) if (c && Math.abs(c.deviation) <= config.verifyMaxDeviationMinutes + EPS) neighbours.push(c);
  }
  neighbours.sort((a, b) => a.distance - b.distance || a.base.minute - b.base.minute);
  let sameLine = neighbours.map((c) => passageOf(c, fact.lineId));
  if (hint?.tripId && !sameLine.some((p) => p.tripId === hint.tripId)) {
    // A descida casou com uma viagem que não é vizinha: ela entra na lista mesmo assim, com a passagem mais perto dela.
    const own = evaluated.find((c) => c.tripId === hint.tripId);
    if (own) sameLine = [passageOf(own, fact.lineId), ...sameLine];
  }
  return { status: "orphan", sameLine: hintFirst(sameLine), otherLines: otherLines(), candidates: [] };
}

// ─── Descida (§3.3, T-40) ───────────────────────────────────────────────────

export type AlightEditProblem = RideProblemCode;

/**
 * O invariante 5 para a edição de uma descida (ou da hora do embarque que já tem descida): percurso igual, posição
 * maior, hora maior ou igual. Devolve um código estável (`pattern_differs`, `position_not_after`, `before_boarding`) ou
 * `null`. Sem passagem deduzida de um dos lados (`patternId`/`position` nulos), só a hora é conferida.
 */
export function checkAlightEdit(
  board: { patternId: string | null; position: number | null; observedAt: number },
  alight: { patternId: string | null; position: number | null; observedAt: number },
): AlightEditProblem | null {
  return checkRideCode(board, alight);
}
