/**
 * Constrói o GeoJSON de pontos com localização para a camada do mapa (E-07 Bloco 5, Item 1, D-051).
 * Puro: sem React e sem biblioteca nativa.
 */
import { validateLocation, type GeoPoint } from "@notebus/domain";

export interface MapPointProperties {
  id: string;
  name: string;
  filled: boolean;
}

export interface BuildMapPointsInput {
  locations: readonly { id: string; lat: number; lon: number }[];
  names: ReadonlyMap<string, string>;
  stopsWithRecords: ReadonlySet<string>;
}

export function buildMapPoints(
  input: BuildMapPointsInput,
): GeoJSON.FeatureCollection<GeoJSON.Point, MapPointProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, MapPointProperties>[] = [];

  for (const loc of input.locations) {
    const point: GeoPoint = { lat: loc.lat, lon: loc.lon };
    if (!validateLocation(point, null, "suggested").ok) {
      continue;
    }

    const name = input.names.get(loc.id) ?? "";
    const filled = input.stopsWithRecords.has(loc.id);

    features.push({
      type: "Feature",
      id: loc.id,
      geometry: {
        type: "Point",
        coordinates: [loc.lon, loc.lat],
      },
      properties: {
        id: loc.id,
        name,
        filled,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Helper puro: calcula o conjunto de stopIds com ao menos um registro seu, vivo (deletedAt nulo).
 */
export function collectStopsWithRecords(
  observations: readonly { stopId?: string | null; deletedAt?: number | null }[],
): Set<string> {
  const result = new Set<string>();
  for (const obs of observations) {
    if (obs.stopId && (obs.deletedAt === null || obs.deletedAt === undefined)) {
      result.add(obs.stopId);
    }
  }
  return result;
}
