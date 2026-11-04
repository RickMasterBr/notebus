/**
 * Resumo da viagem em andamento para o cartão Em viagem (D-393, ideia 238).
 * Função pura: sem relógio, sem banco, sem estado do aparelho.
 */
import type { AlightRow, TripCardModel } from "./rideView";
import { serviceMinuteOn } from "./rideView";
import type { ScheduleSnapshot } from "./schedule";
import { buildAlightList } from "./alightList";

export type TripSummary =
  | { kind: "chosen"; row: AlightRow }
  | { kind: "next"; row: AlightRow };

export function tripSummary(
  card: TripCardModel,
  data: ScheduleSnapshot,
  chosenPosition: number | null,
  now: number,
): TripSummary | null {
  const { rows } = buildAlightList(card, data, now);
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  if (chosenPosition !== null) {
    const chosenRow = rows.find((r) => r.position === chosenPosition);
    if (chosenRow) {
      return { kind: "chosen", row: chosenRow };
    }
  }

  if (!card.trip) {
    return null;
  }

  const currentMinute = serviceMinuteOn(card.trip.serviceDate, now);
  if (currentMinute === null) {
    return { kind: "next", row: firstRow };
  }

  const nextRow = rows.find((r) => r.minute >= currentMinute);
  if (nextRow) {
    return { kind: "next", row: nextRow };
  }

  const lastRow = rows[rows.length - 1] ?? firstRow;
  return { kind: "next", row: lastRow };
}
