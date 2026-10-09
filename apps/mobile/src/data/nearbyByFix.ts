/**
 * "Perto de você" pela posição (E-07 §3.4, T-63): os pontos com localização a até `nearRadiusM` da leitura, do mais perto
 * ao mais longe, no máximo `max`. Mesmas regras de validade do domínio para a leitura (precisão e idade). Puro.
 */
import { DOMAIN_CONFIG, type PositionFix, distanceM } from "@notebus/domain";

/** A mesma tolerância do domínio para um relógio um pouco atrás da leitura. */
const FUTURE_TOLERANCE_MS = 5_000;

export function nearbyStopIdsByFix(
  fix: PositionFix | null,
  nowMs: number,
  stops: readonly { id: string; lat: number | null; lon: number | null }[],
  max = 3,
): string[] {
  if (fix === null || fix.accuracyM === null || fix.accuracyM > DOMAIN_CONFIG.suggestMaxAccuracyM) return [];
  const age = nowMs - fix.atMs;
  if (age > DOMAIN_CONFIG.suggestMaxAgeMs || age < -FUTURE_TOLERANCE_MS) return [];
  const found: { id: string; metres: number }[] = [];
  for (const s of stops) {
    if (s.lat === null || s.lon === null) continue;
    const metres = distanceM(fix, { lat: s.lat, lon: s.lon });
    if (metres <= DOMAIN_CONFIG.nearRadiusM) found.push({ id: s.id, metres });
  }
  return found
    .sort((a, b) => a.metres - b.metres)
    .slice(0, max)
    .map((f) => f.id);
}
