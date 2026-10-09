/**
 * Onde o mapa abre (E-07 §3.7, D-096 e D-110, T-67). Puro: o relógio entra por `nowMs`, o lugar Casa já vem resolvido.
 */
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { distanceM, type GeoPoint, type PositionFix } from "./geo.ts";
import { validateLocation } from "./stopLocation.ts";

export type MapOpeningSource = "gps" | "home" | "last" | "leiria";
export interface MapOpening {
  point: GeoPoint;
  source: MapOpeningSource;
}

const isUsablePoint = (p: GeoPoint | null): p is GeoPoint => p !== null && validateLocation(p, null, "suggested").ok;

function isGoodFix(fix: PositionFix | null, nowMs: number, config: DomainConfig): fix is PositionFix {
  if (!isUsablePoint(fix) || fix.accuracyM === null || fix.accuracyM > config.mapOpenMaxAccuracyM) return false;
  const ageMs = nowMs - fix.atMs;
  return ageMs >= 0 && ageMs <= config.mapOpenMaxAgeMs && distanceM(fix, config.leiriaCenter) <= config.mapOpenMaxFromLeiriaM;
}

/** Na ordem: GPS bom, recente e perto de Leiria; Casa; última posição do mapa; centro de Leiria. Ponto inválido cai para o próximo. */
export function chooseMapOpening(
  input: { fix: PositionFix | null; nowMs: number; home: GeoPoint | null; lastMapPosition: GeoPoint | null },
  config: DomainConfig = DOMAIN_CONFIG,
): MapOpening {
  const { fix, nowMs, home, lastMapPosition } = input;
  if (isGoodFix(fix, nowMs, config)) return { point: { lat: fix.lat, lon: fix.lon }, source: "gps" };
  if (isUsablePoint(home)) return { point: home, source: "home" };
  if (isUsablePoint(lastMapPosition)) return { point: lastMapPosition, source: "last" };
  return { point: config.leiriaCenter, source: "leiria" };
}
