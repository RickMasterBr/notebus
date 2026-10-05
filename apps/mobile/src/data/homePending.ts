/**
 * Contagem e alvo da linha de registros pendentes do Início (E-04 §6, D-029).
 *
 * Exibido apenas no detent médio quando há registros na fila de conferência.
 * Com 1: abre a TL-09 desse registro.
 * Com mais de 1: abre a TL-09 do mais recente.
 */
import { reviewQueue } from "./review";
import type { ObservationRow } from "./registro";
import { t } from "../i18n";

export interface HomePendingInfo {
  count: number;
  text: string;
  targetObservationId: string;
}

export function homePendingInfo(observations: readonly ObservationRow[]): HomePendingInfo | null {
  const queue = reviewQueue(observations);
  if (queue.length === 0) return null;

  const count = queue.length;
  const targetObservationId = queue[0]!.id;
  const text = count === 1 ? t("home.pending_one") : t("home.pending_review", { count });

  return {
    count,
    text,
    targetObservationId,
  };
}
