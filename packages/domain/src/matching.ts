/**
 * Casamento de um registro com a viagem e a dedução completa do registro (E-03 §3.3, Fase 1 §4.2, D-021, D-071).
 *
 * Puro: sem banco e sem relógio. A dedução é função **só do fato** (e dos dados da rede): chamada de novo com o
 * mesmo fato dá o mesmo resultado, para o app poder refazê-la na abertura seguinte se o cálculo falhar (D-085, T-22).
 * Casa por **posição e ID do ponto**, nunca pelo nome (T-17). O instante vira dia e minuto de serviço no fuso da
 * rede pelas funções da E-02 (invariante 7).
 */
import { serviceDaysAt, tripsRunningOn, type CalendarData, type ScheduleData } from "./calendar.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { baseTimeAt, type BaseTime, type MatchStatus, type PatternData, type TripData } from "./passages.ts";
import type { DayTypeCode } from "./seedFormat.ts";

/** O fato de um registro (D-085): o que você disse. */
export interface ObservationFact {
  stopId: string;
  lineId: string;
  /** Epoch ms UTC, com segundos. */
  observedAt: number;
  /** Fim do intervalo (invariante 4), ou `null`. O intervalo casa pelo ponto médio (T-15). */
  observedEndAt: number | null;
  kind: "boarded" | "passed" | "alighted";
  mode: "live" | "later" | "memory";
}

/** Um percurso com a sua linha. */
export interface LinePatternData extends PatternData {
  lineId: string;
}

/** O que o casamento lê da rede: calendário, o que circula em cada data, percursos e viagens com horários. */
export interface MatchNetwork {
  calendar: CalendarData;
  schedule: ScheduleData;
  patterns: readonly LinePatternData[];
  /** Viagens com horários; o `id` é o mesmo das viagens de `schedule.trips`. */
  trips: readonly TripData[];
}

/** A viagem em curso (D-071): o `ride` aberto, já com a viagem e o dia de serviço deduzidos. */
export interface OngoingRide {
  lineId: string;
  tripId: string;
  serviceDate: string;
}

/** Um par (viagem, posição) avaliado. */
export interface MatchCandidate {
  tripId: string;
  patternId: string;
  position: number;
  serviceDate: string;
  dayType: DayTypeCode;
  /** Minuto de serviço do registro nesse dia de serviço, com decimais (os segundos entram). */
  observedMinute: number;
  base: BaseTime;
  /** Atraso = observado − base, com decimais. */
  deviation: number;
  /** Distância normalizada pela tolerância do lado: atraso / 15, adiantamento / 5 (T-13). ≤ 1 = dentro da janela. */
  distance: number;
}

export interface MatchResult {
  status: Exclude<MatchStatus, "manual">;
  /** Os pares dentro da janela −5/+15 (inclusive), do mais perto ao mais longe pela distância normalizada. */
  candidates: MatchCandidate[];
  /** O par mais perto pela distância normalizada, dentro ou fora da janela; `null` se a linha não passa no ponto. */
  nearest: MatchCandidate | null;
}

// Folga contra o erro de ponto flutuante da interpolação (um +15 calculado como 15,0000001 continua dentro).
const EPS = 1e-6;
const MINUTE_MS = 60_000;

/** O instante que casa: o próprio, ou o ponto médio do intervalo (Fase 1 §4.2, T-15). */
export function matchInstant(fact: Pick<ObservationFact, "observedAt" | "observedEndAt">): number {
  return fact.observedEndAt === null ? fact.observedAt : (fact.observedAt + fact.observedEndAt) / 2;
}

/** Distância normalizada de um desvio: o atraso conta sobre 15 min, o adiantamento sobre 5 (T-13: +18 → 1,20; −12 → 2,40). */
export function normalizedDistance(deviation: number, config: DomainConfig = DOMAIN_CONFIG): number {
  return deviation >= 0 ? deviation / config.matchLateMinutes : -deviation / config.matchEarlyMinutes;
}

/**
 * Casa um registro com as viagens (Fase 1 §4.2): candidatos = pares (viagem, posição) da linha, neste ponto, com
 * desvio de −5 a +15 inclusive, olhando o dia de serviço de hoje e o de ontem (viagens depois da meia-noite, D-016).
 * Um candidato → `auto`; vários → `ambiguous`; nenhum → `orphan`, com o mais perto em `nearest`.
 * Com uma viagem em curso da mesma linha (D-071), só contam as passagens dessa viagem nesse dia de serviço.
 */
export function matchObservation(
  fact: Pick<ObservationFact, "stopId" | "lineId" | "observedAt" | "observedEndAt">,
  network: MatchNetwork,
  ride: OngoingRide | null = null,
  config: DomainConfig = DOMAIN_CONFIG,
): MatchResult {
  const instant = matchInstant(fact);
  const seconds = (((instant % MINUTE_MS) + MINUTE_MS) % MINUTE_MS) / MINUTE_MS;
  const { today, yesterday } = serviceDaysAt(instant, network.calendar);
  const inRide = ride !== null && ride.lineId === fact.lineId ? ride : null;
  const tripsById = new Map(network.trips.map((t) => [t.id, t]));
  const evaluated: MatchCandidate[] = [];

  for (const day of [today, yesterday]) {
    if (inRide && inRide.serviceDate !== day.date) continue;
    const running = new Set(tripsRunningOn(day.date, day.dayType.dayType, network.schedule).map((t) => t.id));
    const observedMinute = day.minute + seconds;
    for (const pattern of network.patterns) {
      if (pattern.lineId !== fact.lineId) continue;
      const positions = pattern.stops.filter((s) => s.stopId === fact.stopId).map((s) => s.position);
      if (positions.length === 0) continue;
      for (const tripId of running) {
        if (inRide && tripId !== inRide.tripId) continue;
        const trip = tripsById.get(tripId);
        if (!trip || trip.patternId !== pattern.id) continue;
        for (const position of positions) {
          const base = baseTimeAt(trip, position);
          if (!base) continue;
          const deviation = observedMinute - base.minute;
          evaluated.push({
            tripId,
            patternId: pattern.id,
            position,
            serviceDate: day.date,
            dayType: day.dayType.dayType,
            observedMinute,
            base,
            deviation,
            distance: normalizedDistance(deviation, config),
          });
        }
      }
    }
  }

  evaluated.sort((a, b) => a.distance - b.distance || a.base.minute - b.base.minute);
  const candidates = evaluated.filter((c) => c.deviation >= -config.matchEarlyMinutes - EPS && c.deviation <= config.matchLateMinutes + EPS);
  const status = candidates.length === 1 ? "auto" : candidates.length > 1 ? "ambiguous" : "orphan";
  return { status, candidates, nearest: evaluated[0] ?? null };
}

/** A dedução de um registro (D-085): o que o app conclui do fato. Recalculável a qualquer momento. */
export interface Deduction {
  /** Dia e minuto de serviço: os da viagem casada; sem casamento `auto`, os do relógio de hoje (D-016). */
  serviceDate: string;
  serviceMinute: number;
  /** Só com `auto`: a passagem (viagem + posição), o percurso e o atraso. */
  tripId: string | null;
  patternId: string | null;
  position: number | null;
  deviation: number | null;
  matchStatus: Exclude<MatchStatus, "manual">;
  /** Os pares dentro da janela (para a pergunta do `ambiguous`) e o mais perto (para a órfã, TL-09). */
  candidates: MatchCandidate[];
  nearest: MatchCandidate | null;
}

/**
 * Dedução completa do fato (E-03 §3.2–§3.3): dia e minuto de serviço, passagem, viagem, atraso e status.
 * Função pura do fato, da rede e da viagem em curso: sem efeito colateral, mesma entrada → mesmo resultado (T-22).
 * Um vínculo `manual` (E-04) não passa por aqui: quem chama não o recalcula.
 */
export function deduceObservation(
  fact: ObservationFact,
  network: MatchNetwork,
  ride: OngoingRide | null = null,
  config: DomainConfig = DOMAIN_CONFIG,
): Deduction {
  const match = matchObservation(fact, network, ride, config);
  const chosen = match.status === "auto" ? match.candidates[0]! : null;
  const instant = matchInstant(fact);
  const { today } = serviceDaysAt(instant, network.calendar);
  return {
    serviceDate: chosen ? chosen.serviceDate : today.date,
    serviceMinute: chosen ? chosen.observedMinute : today.minute + (((instant % MINUTE_MS) + MINUTE_MS) % MINUTE_MS) / MINUTE_MS,
    tripId: chosen?.tripId ?? null,
    patternId: chosen?.patternId ?? null,
    position: chosen?.position ?? null,
    deviation: chosen?.deviation ?? null,
    matchStatus: match.status,
    candidates: match.candidates,
    nearest: match.nearest,
  };
}
