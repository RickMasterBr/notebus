/**
 * Região do mapa offline (E-07 §3.6, D-179, T-71): a caixa padrão cresce para conter os pontos e lugares do usuário
 * perto de Leiria, e a contagem de tiles vem da grade padrão (web mercator). Puro.
 */
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { distanceM, type GeoPoint } from "./geo.ts";
import { validateLocation } from "./stopLocation.ts";

export interface OfflineBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface OfflineRegion {
  bounds: OfflineBounds;
  tileCount: number;
  estimatedMb: number;
  ignoredPoints: number;
}

const METERS_PER_DEGREE_LAT = 111_194.9;

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
};

function countTiles(b: OfflineBounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z += 1) {
    total += (tileX(b.east, z) - tileX(b.west, z) + 1) * (tileY(b.south, z) - tileY(b.north, z) + 1);
  }
  return total;
}

function expand(b: OfflineBounds, p: GeoPoint, marginM: number): OfflineBounds {
  const dLat = marginM / METERS_PER_DEGREE_LAT;
  const dLon = dLat / Math.cos((p.lat * Math.PI) / 180);
  return {
    south: Math.min(b.south, p.lat - dLat),
    west: Math.min(b.west, p.lon - dLon),
    north: Math.max(b.north, p.lat + dLat),
    east: Math.max(b.east, p.lon + dLon),
  };
}

/** Pontos inválidos ou a mais de `offlineMaxPointFromLeiriaM` do centro de Leiria não entram e contam em `ignoredPoints`. */
export function offlineRegion(extraPoints: readonly GeoPoint[], config: DomainConfig = DOMAIN_CONFIG): OfflineRegion {
  let bounds: OfflineBounds = { ...config.offlineBox };
  let ignoredPoints = 0;
  for (const p of extraPoints) {
    const usable = validateLocation(p, null, "suggested").ok && distanceM(p, config.leiriaCenter) <= config.offlineMaxPointFromLeiriaM;
    if (usable) bounds = expand(bounds, p, config.offlineMarginM);
    else ignoredPoints += 1;
  }
  const tileCount = countTiles(bounds, config.offlineMinZoom, config.offlineMaxTileZoom);
  return { bounds, tileCount, estimatedMb: (tileCount * config.offlineAvgTileKb) / 1024, ignoredPoints };
}
