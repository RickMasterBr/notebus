/**
 * O que o cartão "Em viagem" do Início mostra (D-413, D-393, ideia 238): a hora à direita só com a descida escolhida;
 * sem ela, a próxima paragem; e a linha que o "Desci aqui" grava (a destacada da lista de descidas).
 * Função pura: sem relógio, sem banco, sem estado do aparelho.
 */
import { t } from "../i18n";
import { buildAlightList } from "./alightList";
import type { AlightRow, TripCardModel } from "./rideView";
import type { ScheduleSnapshot } from "./schedule";
import { tripSummary } from "./tripSummary";

export interface TripCardHome {
  /** "~08:45" da descida escolhida; `null` sem escolha (ou sem viagem). */
  etaText: string | null;
  /** "Próxima: Campus" da paragem mais provável; `null` com a descida escolhida. */
  nextLine: string | null;
  /** A linha que o "Desci aqui" grava: a destacada da lista de descidas; `null` sem viagem. */
  alightRow: AlightRow | null;
}

export function tripCardHome(input: {
  card: TripCardModel;
  data: ScheduleSnapshot;
  chosenPosition: number | null;
  now: number;
}): TripCardHome {
  const { card, data, chosenPosition, now } = input;
  const summary = tripSummary(card, data, chosenPosition, now);

  const etaText =
    summary?.kind === "chosen" ? `${summary.row.approximate ? "~" : ""}${summary.row.time}` : null;
  const nextLine =
    summary?.kind === "next" ? t("trip.next_stop", { stop_name: summary.row.name }) : null;

  const { rows, highlightedPosition } = buildAlightList(card, data, now, chosenPosition);
  const alightRow =
    highlightedPosition === null
      ? null
      : (rows.find((r) => r.position === highlightedPosition) ?? null);

  return { etaText, nextLine, alightRow };
}
