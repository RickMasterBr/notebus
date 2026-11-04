/**
 * Lista de paragens para a folha "Onde você desceu?" na ordem do percurso (D-392, ideia 165 opção b).
 * Função pura: sem relógio, sem banco, sem estado do aparelho.
 */
import type { AlightRow, TripCardModel } from "./rideView";
import { buildAlightRows } from "./rideView";
import type { ScheduleSnapshot } from "./schedule";

export interface AlightList {
  rows: AlightRow[];
  highlightedPosition: number | null;
}

export function buildAlightList(
  card: TripCardModel,
  data: ScheduleSnapshot,
  openedAt: number,
  chosenPosition?: number | null,
): AlightList {
  const rawRows = buildAlightRows(card, data, openedAt);
  const firstRaw = rawRows[0];
  if (!firstRaw) {
    return { rows: [], highlightedPosition: null };
  }

  const rows = [...rawRows].sort((a, b) => a.position - b.position);
  const chosenExists = chosenPosition != null && rows.some((r) => r.position === chosenPosition);
  const highlightedPosition = chosenExists ? chosenPosition : firstRaw.position;

  return { rows, highlightedPosition };
}
