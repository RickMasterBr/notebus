/**
 * Perfil da linha no detalhe (TL-11, ideia 20): quantos percursos, paragens e viagens. Lógica pura, sem React.
 *
 * Exemplo: dois percursos que dividem 1 ponto e têm 5 viagens hoje → "2 percursos · 3 paragens · 5 viagens neste tipo de dia".
 * Paragem conta por ponto físico (D-015): o ponto por onde a linha passa duas vezes conta uma vez.
 */
import type { DayTypeCode } from "@notebus/domain";
import { t } from "../i18n";
import type { NetworkPatternItem } from "../db/networkList";
import { baseTimes } from "./networkView";
import type { ScheduleSnapshot } from "./schedule";

export interface LineProfile {
  patternCount: number;
  stopCount: number;
  /** `null` enquanto os horários não carregaram. */
  tripCount: number | null;
}

export function lineProfile(input: {
  patterns: readonly NetworkPatternItem[];
  snapshot: ScheduleSnapshot | null;
  dayType: DayTypeCode;
  todayLisbon: string;
}): LineProfile {
  const { patterns, snapshot, dayType, todayLisbon } = input;
  const stopIds = new Set(patterns.flatMap((p) => p.stops.map((s) => s.stopId)));
  let tripCount: number | null = null;
  if (snapshot) {
    tripCount = 0;
    for (const p of patterns) {
      const { times, partialCount } = baseTimes({ snapshot, patternId: p.id, dayType, todayLisbon });
      tripCount += times.length + partialCount;
    }
  }
  return { patternCount: patterns.length, stopCount: stopIds.size, tripCount };
}

const plural = (n: number, one: "net.line.patterns_one" | "net.pattern.stops_one" | "net.profile.trips_one", other: "net.line.patterns_other" | "net.pattern.stops_other" | "net.profile.trips_other") =>
  n === 1 ? t(one) : t(other, { n });

export function lineProfileText(profile: LineProfile): string {
  const parts = [
    plural(profile.patternCount, "net.line.patterns_one", "net.line.patterns_other"),
    plural(profile.stopCount, "net.pattern.stops_one", "net.pattern.stops_other"),
  ];
  if (profile.tripCount !== null) parts.push(plural(profile.tripCount, "net.profile.trips_one", "net.profile.trips_other"));
  return parts.join(" · ");
}
