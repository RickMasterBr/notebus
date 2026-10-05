/**
 * Visão de edição e conferência (E-04 bloco 2): funções puras para alimentar TL-06 e TL-09 na memória.
 */
import type { OngoingRide } from "@notebus/domain";
import type { ObservationRow, RideRow } from "./registro";

/**
 * D-071: dentro de uma viagem em curso só contam as passagens dela. O embarque que abriu o `ride` não se apoia nele;
 * uma descida (ou outro registro do mesmo `ride`) sim, se o embarque já tem viagem (`auto` ou `manual`).
 *
 * Origem: regra de `ongoingFor` em `apps/mobile/src/data/registro.ts` (linhas 394–402).
 */
export function ongoingOf(
  row: Pick<ObservationRow, "id" | "rideId">,
  rides: readonly Pick<RideRow, "id" | "boardingObservationId">[],
  observations: readonly Pick<ObservationRow, "id" | "lineId" | "tripId" | "serviceDate" | "matchStatus">[],
): OngoingRide | null {
  if (!row.rideId) return null;
  const parent = rides.find((r) => r.id === row.rideId);
  if (!parent || parent.boardingObservationId === row.id) return null;
  const boarding = observations.find((o) => o.id === parent.boardingObservationId);
  if (
    boarding?.tripId &&
    boarding.serviceDate &&
    (boarding.matchStatus === "auto" || boarding.matchStatus === "manual")
  ) {
    return { lineId: boarding.lineId, tripId: boarding.tripId, serviceDate: boarding.serviceDate };
  }
  return null;
}
