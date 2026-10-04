/**
 * TL-03 Registrar (E-03 bloco 2; 4.1 §6.1 e §6.2): o ponto sugerido e as linhas da folha. Puro: sem banco, sem relógio.
 *
 * **Ponto sugerido, sem localização (a localização é a E-07):**
 * 1. o ponto **mais registrado neste tipo de dia e nesta faixa de horário** (±60 min do instante, em minutos do dia,
 *    mesmo tipo de dia); empate: o registrado mais recentemente. A faixa não está definida no plano (proposta do bloco 2);
 * 2. sem histórico nessa faixa: o último ponto usado (o do registro mais recente; sem registro nenhum, o último aberto);
 * 3. nada disso: `null`, e a folha pede para escolher o ponto pela Busca.
 *
 * **Linhas da folha:** cada passagem do ponto (percurso + posição) é uma linha, ordenada pela passagem esperada **mais
 * perto de agora**; uma linha que passa duas vezes perto do mesmo horário aparece duas vezes, cada uma com o seu
 * destino (4.1 §6.2). O horário esperado é o do domínio, já com os registros do usuário.
 */
import {
  type PassageRecord,
  baseTimeAt,
  displayCenter,
  expectedTime,
  passageInfo,
  serviceDaysAt,
  timepointPositions,
  tripsRunningOn,
} from "@notebus/domain";
import { passageTarget } from "./records";
import type { ObservationRow } from "./registro";
import type { ScheduleSnapshot } from "./schedule";
import { nextDestination } from "./rideView";
import { clockText } from "./stopCard";

/** Meia janela do ponto sugerido, em minutos (proposta do bloco 2). */
export const SUGGEST_WINDOW_MINUTES = 60;

type Visit = Pick<ObservationRow, "stopId" | "observedAt" | "kind">;

/** O ponto que a folha Registrar sugere, ou `null` quando não há nada em que se apoiar. */
export function suggestStop(
  observations: readonly Visit[],
  instant: number,
  data: Pick<ScheduleSnapshot, "calendar">,
  lastOpenedStopId: string | null,
): string | null {
  // Só embarques contam: é onde o usuário costuma estar (a descida e o "vi passar" são outro lugar ou outro gesto).
  const boardings = observations.filter((o) => o.kind === "boarded" || o.kind === "passed");
  const today = serviceDaysAt(instant, data.calendar).today;
  const tally = new Map<string, { count: number; latest: number }>();
  for (const o of boardings) {
    const day = serviceDaysAt(o.observedAt, data.calendar).today;
    if (day.dayType.dayType !== today.dayType.dayType) continue;
    if (Math.abs(day.minute - today.minute) > SUGGEST_WINDOW_MINUTES) continue;
    const entry = tally.get(o.stopId) ?? { count: 0, latest: 0 };
    tally.set(o.stopId, { count: entry.count + 1, latest: Math.max(entry.latest, o.observedAt) });
  }
  let best: { stopId: string; count: number; latest: number } | null = null;
  for (const [stopId, { count, latest }] of tally) {
    if (best === null || count > best.count || (count === best.count && latest > best.latest)) best = { stopId, count, latest };
  }
  if (best) return best.stopId;

  const last = boardings.reduce<Visit | null>((a, o) => (a === null || o.observedAt > a.observedAt ? o : a), null);
  return last?.stopId ?? lastOpenedStopId;
}

/** Uma linha da folha Registrar: a passagem, com o horário esperado e o "daqui a N min". */
export interface BoardChoice {
  key: string;
  lineId: string;
  code: string;
  color: string;
  patternId: string;
  position: number;
  /** O próximo ponto de controle depois do ponto ("→ Campus 2 ULO"): o que separa duas passagens da mesma linha. */
  destination: string | null;
  tripId: string;
  /** "HH:MM", o centro esperado ao minuto mais próximo (D-092). */
  time: string;
  /** Horário estimado (confiança que não é alta): leva o `~`. */
  approximate: boolean;
  confidence: "estimated" | "low" | "medium" | "high";
  /** Minutos até a passagem esperada (negativo: já passou). */
  minutesAhead: number;
  /** O botão em destaque: a passagem mais perto de agora. */
  highlighted: boolean;
}

/**
 * As linhas da folha para um ponto. Entram só as passagens de embarque (a última posição da viagem termina no ponto)
 * de viagens que circulam hoje ou ontem (depois da meia-noite). De cada (percurso, posição) fica a passagem esperada
 * mais perto de agora.
 */
export function boardChoices(
  stopId: string,
  data: ScheduleSnapshot,
  records: readonly PassageRecord[],
  instant: number,
): BoardChoice[] {
  const { today, yesterday } = serviceDaysAt(instant, data.calendar);
  const choices: (BoardChoice & { distance: number })[] = [];

  for (const pattern of data.patterns) {
    const positions = pattern.stops.filter((s) => s.stopId === stopId).map((s) => s.position);
    const lineId = data.patternLineId.get(pattern.id);
    const line = lineId === undefined ? undefined : data.lineInfo.get(lineId);
    if (positions.length === 0 || lineId === undefined || !line) continue;
    const patternTrips = data.trips.filter((t) => t.patternId === pattern.id);
    const timepoints = timepointPositions(pattern, patternTrips);

    for (const position of positions) {
      const info = passageInfo(pattern, timepoints, position);
      let best: (BoardChoice & { distance: number }) | null = null;
      for (const day of [yesterday, today]) {
        const running = new Set(tripsRunningOn(day.date, day.dayType.dayType, data.schedule).map((t) => t.id));
        for (const trip of patternTrips) {
          if (!running.has(trip.id) || position === trip.lastPosition) continue;
          const base = baseTimeAt(trip, position);
          const target = passageTarget(data, trip.id, position, day.date);
          if (!base || !target) continue;
          const expected = expectedTime(base, records, { target, now: instant });
          const delta = expected.center - day.minute;
          const distance = Math.abs(delta);
          // Empate: a passagem que ainda vem (a de baixo, `delta ≥ 0`) vale mais que a que já passou.
          if (best !== null && (distance > best.distance || (distance === best.distance && delta < best.minutesAhead))) continue;
          best = {
            key: `${pattern.id}:${position}`,
            lineId,
            code: line.code,
            color: line.color,
            patternId: pattern.id,
            position: info.position,
            destination: nextDestination(data, pattern.id, trip.id, position)?.name ?? null,
            tripId: trip.id,
            time: clockText(displayCenter(expected.center)),
            approximate: expected.confidence !== "high",
            confidence: expected.confidence,
            minutesAhead: delta,
            highlighted: false,
            distance,
          };
        }
      }
      if (best) choices.push(best);
    }
  }

  choices.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.minutesAhead - a.minutesAhead ||
      a.code.localeCompare(b.code, "pt", { numeric: true }) ||
      a.position - b.position,
  );
  return choices.map(({ distance: _distance, ...choice }, i) => ({ ...choice, highlighted: i === 0 }));
}

/** "agora" | "daqui a N min" | "há N min": arredondado ao minuto, só para mostrar. */
export function relativeMinutes(minutesAhead: number): { kind: "now" } | { kind: "in" | "ago"; minutes: number } {
  const rounded = displayCenter(minutesAhead);
  if (rounded === 0) return { kind: "now" };
  return rounded > 0 ? { kind: "in", minutes: rounded } : { kind: "ago", minutes: -rounded };
}
