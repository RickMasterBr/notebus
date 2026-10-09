/**
 * Geografia da E-07 (plano §3.4, T-68): distância entre dois pontos e mediana de um conjunto.
 * Puro: o domínio só recebe coordenadas e instantes em milissegundos; a camada nativa converte o que o aparelho entrega.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Uma leitura de posição do aparelho. `atMs` é epoch em **milissegundos**. */
export interface PositionFix extends GeoPoint {
  accuracyM: number | null;
  atMs: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em metros pela fórmula de haversine (raio médio da Terra). */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mediana da latitude e da longitude, separadas. Lança erro com a lista vazia. */
export function medianPoint(points: readonly GeoPoint[]): GeoPoint {
  if (points.length === 0) throw new Error("medianPoint: lista vazia");
  return { lat: median(points.map((p) => p.lat)), lon: median(points.map((p) => p.lon)) };
}
