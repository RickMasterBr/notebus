/**
 * Regra de resolução da origem no TL-04 (D-175).
 *
 * 1. Escolha salva tem precedência (chave goto_last_origin).
 * 2. Sem escolha salva: lugar chamado 'Casa' (case-insensitive) vence.
 * 3. Sem 'Casa': primeiro trajeto que chega ao destino (ordenado por opções / criação).
 * 4. Sem nenhum trajeto para o destino: fallback para editor (kind: "no_route").
 */
import type { OptionRow, PlaceRow, RouteRow } from "../db/places";

export interface ResolveOriginInput {
  destinationPlaceId: string;
  places: readonly PlaceRow[];
  routes: readonly RouteRow[];
  options?: readonly OptionRow[];
  lastOriginMap?: Record<string, string>;
}

export type ResolveOriginResult =
  | {
      kind: "resolved";
      originPlaceId: string;
      originPlace: PlaceRow;
      route?: RouteRow;
    }
  | {
      kind: "no_route";
    };

export function resolveGotoOrigin(input: ResolveOriginInput): ResolveOriginResult {
  const { destinationPlaceId, places, routes, options, lastOriginMap = {} } = input;

  const activePlaces = places.filter((p) => p.deletedAt === null);
  const activeRoutesToDest = routes.filter(
    (r) => r.destinationPlaceId === destinationPlaceId && r.deletedAt === null,
  );

  const hasOptions = (routeId: string) => {
    if (options === undefined) return true;
    return options.some((o) => o.routeId === routeId && o.deletedAt === null);
  };

  const validRoutesToDest = activeRoutesToDest.filter((r) => hasOptions(r.id));

  // Sem trajeto ativo com opções até o destino -> fallback para editor (no_route)
  if (validRoutesToDest.length === 0) {
    return { kind: "no_route" };
  }

  // 1. A escolha salva vale só se existe trajeto ativo dessa origem ao destino com pelo menos uma opção
  const savedOriginId = lastOriginMap[destinationPlaceId];
  if (savedOriginId && savedOriginId !== destinationPlaceId) {
    const savedPlace = activePlaces.find((p) => p.id === savedOriginId);
    if (savedPlace) {
      const route = validRoutesToDest.find((r) => r.originPlaceId === savedOriginId);
      if (route) {
        return {
          kind: "resolved",
          originPlaceId: savedPlace.id,
          originPlace: savedPlace,
          route,
        };
      }
    }
  }

  // 2. Senão, o lugar "Casa" vale só se tem trajeto com pelo menos uma opção até o destino
  const casaPlace = activePlaces.find(
    (p) => p.id !== destinationPlaceId && p.name.trim().toLowerCase() === "casa",
  );
  if (casaPlace) {
    const route = validRoutesToDest.find((r) => r.originPlaceId === casaPlace.id);
    if (route) {
      return {
        kind: "resolved",
        originPlaceId: casaPlace.id,
        originPlace: casaPlace,
        route,
      };
    }
  }

  // 3. Senão, a origem do primeiro trajeto com opção até o destino (ordem de criação)
  const sortedRoutes = [...validRoutesToDest].sort((a, b) => a.createdAt - b.createdAt);

  for (const r of sortedRoutes) {
    const originPlace = activePlaces.find((p) => p.id === r.originPlaceId);
    if (originPlace) {
      return {
        kind: "resolved",
        originPlaceId: originPlace.id,
        originPlace,
        route: r,
      };
    }
  }

  return { kind: "no_route" };
}
