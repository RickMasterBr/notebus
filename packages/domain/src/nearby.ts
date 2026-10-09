/**
 * "Quem está perto" (E-07 §3.4, T-63 a T-66): o ponto sugerido pelo GPS e o lugar perto.
 * Puro: o "agora" chega como argumento; a pontuação da rotina é calculada fora e chega pronta em `routineRank`.
 * Quem chama aplica depois a cadeia do app (rotina, último usado, "Cadastrar um ponto"); aqui só se decide pela posição.
 */
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { distanceM, type GeoPoint, type PositionFix } from "./geo.ts";

/** Relógio atrasado em relação à posição: até isto ainda vale; além disso a leitura é do "futuro" e fica inválida. */
const FUTURE_TOLERANCE_MS = 5_000;

interface WithLocation {
  id: string;
  lat: number | null;
  lon: number | null;
}

interface Located {
  id: string;
  point: GeoPoint;
  fromFixM: number;
}

/** A leitura serve? Precisão conhecida e boa, nem velha demais nem do futuro. */
function usableFix(fix: PositionFix | null, nowMs: number, config: DomainConfig): fix is PositionFix {
  if (fix === null || fix.accuracyM === null || fix.accuracyM > config.suggestMaxAccuracyM) return false;
  const age = nowMs - fix.atMs;
  return age <= config.suggestMaxAgeMs && age >= -FUTURE_TOLERANCE_MS;
}

/** Os itens com localização a até `nearRadiusM` (inclusive) da leitura, do mais perto ao mais longe. */
function withinRadius(fix: PositionFix, items: readonly WithLocation[], config: DomainConfig): Located[] {
  const found: Located[] = [];
  for (const item of items) {
    if (item.lat === null || item.lon === null) continue;
    const point = { lat: item.lat, lon: item.lon };
    const fromFixM = distanceM(fix, point);
    if (fromFixM <= config.nearRadiusM) found.push({ id: item.id, point, fromFixM });
  }
  return found.sort((a, b) => a.fromFixM - b.fromFixM);
}

/**
 * O ponto sugerido pela posição (T-63 a T-65). Entre os pontos a até `nearRadiusM`, o mais perto; se ele tem outro a menos
 * de `facingStopsM` (frente a frente), vence o de maior `routineRank` (ausente conta 0; empate, o mais perto da leitura)
 * e `viaTiebreak` é `true`. Sem leitura válida ou sem candidato: `null`.
 */
export function suggestStop(
  fix: PositionFix | null,
  nowMs: number,
  stops: readonly { id: string; lat: number | null; lon: number | null }[],
  routineRank: ReadonlyMap<string, number>,
  config: DomainConfig = DOMAIN_CONFIG,
): { stopId: string; viaTiebreak: boolean } | null {
  if (!usableFix(fix, nowMs, config)) return null;
  const near = withinRadius(fix, stops, config);
  const closest = near[0];
  if (!closest) return null;
  const facing = near.filter((c) => distanceM(c.point, closest.point) < config.facingStopsM);
  if (facing.length === 1) return { stopId: closest.id, viaTiebreak: false };
  const rank = (c: Located) => routineRank.get(c.id) ?? 0;
  // `facing` já vem do mais perto ao mais longe, então a ordenação estável desempata pela distância à leitura.
  const winner = [...facing].sort((a, b) => rank(b) - rank(a))[0]!;
  return { stopId: winner.id, viaTiebreak: true };
}

/** O lugar (Casa, Facul…) com localização a até `nearRadiusM` da posição, o mais perto, ou `null` (T-66). */
export function nearestPlace<P extends WithLocation>(
  fix: PositionFix | null,
  nowMs: number,
  places: readonly P[],
  config: DomainConfig = DOMAIN_CONFIG,
): P | null {
  if (!usableFix(fix, nowMs, config)) return null;
  const closest = withinRadius(fix, places, config)[0];
  return places.find((p) => p.id === closest?.id) ?? null;
}
