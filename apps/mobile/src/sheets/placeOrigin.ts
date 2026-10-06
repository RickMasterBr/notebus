import type { RouteRow } from "../db/places";
import type { SheetContent } from "./stack";

/**
 * Determina a ação ao escolher uma origem em "Novo trajeto até aqui".
 * Se já existir trajeto cadastrado entre a origem e o destino, abre o trajeto existente
 * (mostrando suas opções e permitindo adicionar nova), evitando travamento e duplicidade.
 */
export function originSelectionAction(
  routes: readonly RouteRow[],
  originPlaceId: string,
  destinationPlaceId: string,
): SheetContent {
  const existingRoute = routes.find(
    (r) =>
      r.originPlaceId === originPlaceId &&
      r.destinationPlaceId === destinationPlaceId &&
      r.deletedAt === null,
  );
  if (existingRoute) {
    return { kind: "route", routeId: existingRoute.id };
  }
  return { kind: "option", originPlaceId, destinationPlaceId };
}
