/**
 * Horário declarado (E-08 §4, TL-07, D-111, D-121): a regra de casamento com as viagens que existem.
 *
 * Puro: sem React, sem banco e sem relógio. Quem chama lê o banco, passa os dados por posição e grava o plano.
 * A tolerância é a do casamento de registros (Fase 1 §4.2): lida de `config`, nunca número solto.
 */

import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { baseTimeAt, passageInfo, type PatternData, type TripData } from "./passages.ts";
import type { DayTypeCode } from "./seedFormat.ts";

/** Horas de 00:00 a 03:59 valem como 24:00 a 27:59 do dia de serviço anterior (D-016, D-111). */
export const DECLARE_NIGHT_CUTOFF_MINUTES = 240;

/** Uma viagem com os tipos de dia em que circula (sem olhar a época, como o resto do app hoje). */
export type DeclareTrip = TripData & { dayTypes: readonly DayTypeCode[] };

/** Uma passagem da linha no ponto: o percurso, a posição e a ordem da vez (`null` se o percurso passa uma vez só). */
export type PassageChoice = { patternId: string; position: number; number: number | null };

export type DeclareReplaces = { origin: "official" | "declared"; serviceMinute: number };

export type DeclareStep =
  | {
      dayType: DayTypeCode;
      action: "update";
      tripId: string;
      patternId: string;
      position: number;
      /** O horário que já estava nessa posição da viagem; `null` se só havia interpolado. */
      replaces: DeclareReplaces | null;
      /** Outros tipos de dia da mesma viagem que a pessoa não marcou: o horário vale para a viagem inteira. */
      alsoAffects: DayTypeCode[];
    }
  | { dayType: DayTypeCode; action: "create_partial"; patternId: string; position: number };

export type DeclareRefusal = "needs_passage" | "no_day_type" | "unknown_stop";

export type DeclarePlan = { ok: true; steps: DeclareStep[] } | { ok: false; reason: DeclareRefusal };

export type DeclareInput = {
  patterns: readonly PatternData[];
  trips: readonly DeclareTrip[];
  stopId: string;
  serviceMinute: number;
  dayTypes: readonly DayTypeCode[];
  choice?: { patternId: string; position: number };
  config?: DomainConfig;
};

/** Hora de relógio (00:00 a 23:59) para minuto de serviço: madrugada vai para o fim do dia anterior. */
export function declaredServiceMinute(hour: number, minute: number): number {
  const clock = hour * 60 + minute;
  return clock < DECLARE_NIGHT_CUTOFF_MINUTES ? 1440 + clock : clock;
}

/** Todas as passagens da linha no ponto: percurso na ordem recebida, depois posição. Duas ou mais exigem escolha (D-121). */
export function passageChoices(patterns: readonly PatternData[], stopId: string): PassageChoice[] {
  const out: PassageChoice[] = [];
  for (const pattern of patterns) {
    const positions = pattern.stops.filter((s) => s.stopId === stopId).map((s) => s.position).sort((a, b) => a - b);
    for (const position of positions) {
      out.push({ patternId: pattern.id, position, number: passageInfo(pattern, new Set(), position).number });
    }
  }
  return out;
}

/** A viagem que serve ao horário declarado: dentro de −early/+late (inclusive), a de menor |delta|; empate: a de base mais cedo. */
function bestTrip(
  trips: readonly DeclareTrip[],
  dayType: DayTypeCode,
  patternId: string,
  position: number,
  serviceMinute: number,
  config: DomainConfig,
): DeclareTrip | null {
  let best: { trip: DeclareTrip; distance: number; base: number } | null = null;
  for (const trip of trips) {
    if (trip.patternId !== patternId || !trip.dayTypes.includes(dayType)) continue;
    const base = baseTimeAt(trip, position);
    if (!base) continue;
    const delta = serviceMinute - base.minute;
    if (delta < -config.matchEarlyMinutes || delta > config.matchLateMinutes) continue;
    const distance = Math.abs(delta);
    if (!best || distance < best.distance || (distance === best.distance && base.minute < best.base)) {
      best = { trip, distance, base: base.minute };
    }
  }
  return best?.trip ?? null;
}

/**
 * O que fazer para declarar `serviceMinute` no ponto, em cada tipo de dia marcado (E-08 §4.1):
 * achou viagem na tolerância: `update` nela (a viagem não se duplica); não achou: `create_partial`.
 * Ponto com 2 ou mais passagens da linha exige `choice` (D-121). Declarar de novo o mesmo horário casa com a
 * parcial que já existe (delta 0) e a atualiza.
 */
export function planDeclaration(input: DeclareInput): DeclarePlan {
  const config = input.config ?? DOMAIN_CONFIG;
  const choices = passageChoices(input.patterns, input.stopId);
  if (choices.length === 0) return { ok: false, reason: "unknown_stop" };
  const dayTypes = [...new Set(input.dayTypes)];
  if (dayTypes.length === 0) return { ok: false, reason: "no_day_type" };

  const chosen =
    choices.length === 1
      ? choices[0]!
      : choices.find((c) => c.patternId === input.choice?.patternId && c.position === input.choice?.position);
  if (!chosen) return { ok: false, reason: "needs_passage" };

  const steps: DeclareStep[] = [];
  for (const dayType of dayTypes) {
    const trip = bestTrip(input.trips, dayType, chosen.patternId, chosen.position, input.serviceMinute, config);
    if (!trip) {
      steps.push({ dayType, action: "create_partial", patternId: chosen.patternId, position: chosen.position });
      continue;
    }
    const existing = trip.stopTimes.find((st) => st.position === chosen.position);
    steps.push({
      dayType,
      action: "update",
      tripId: trip.id,
      patternId: chosen.patternId,
      position: chosen.position,
      replaces: existing ? { origin: existing.origin, serviceMinute: existing.serviceMinute } : null,
      alsoAffects: trip.dayTypes.filter((d) => !dayTypes.includes(d)),
    });
  }
  return { ok: true, steps };
}
