/**
 * A posição que vai no registro (E-07 §3.3). O registro é gravado antes de tudo (D-102): aqui só se decide, com o valor
 * que já está em memória, se ele serve e quais colunas `gps_*` entram. Nada espera o GPS nem uma permissão.
 */
import type { PositionFix } from "@notebus/domain";

/** A posição no registro vale até 10 min (a da sugestão do Registrar é a de 2 min do domínio). */
export const RECORD_FIX_MAX_AGE_MS = 600_000;
/** Relógio um pouco atrás da posição ainda vale (a mesma tolerância do domínio). */
const FUTURE_TOLERANCE_MS = 5_000;

/** A última posição, se ela tem até 10 min; senão `null`. `nowMs` é o relógio real (a hora do GPS não é a do relógio de teste). */
export function fixForRecord(fix: PositionFix | null, nowMs: number): PositionFix | null {
  if (!fix) return null;
  const age = nowMs - fix.atMs;
  return age <= RECORD_FIX_MAX_AGE_MS && age >= -FUTURE_TOLERANCE_MS ? fix : null;
}

/** As colunas do registro: só em registro ao vivo. Ajustado (`later`) e de memória foram feitos de qualquer lugar. */
export function gpsColumns(
  mode: "live" | "later" | "memory",
  gps: PositionFix | null | undefined,
): { gpsLat: number | null; gpsLon: number | null; gpsAccuracyM: number | null } {
  if (mode !== "live" || !gps) return { gpsLat: null, gpsLon: null, gpsAccuracyM: null };
  return { gpsLat: gps.lat, gpsLon: gps.lon, gpsAccuracyM: gps.accuracyM };
}
