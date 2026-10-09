/**
 * Localização do ponto pelo uso (E-07 §3.2, T-69 e T-70): quando oferecer "Guardar a localização deste ponto" e
 * quando uma coordenada é aceita. Puro: sem banco, sem relógio.
 */
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { distanceM, medianPoint, type GeoPoint, type PositionFix } from "./geo.ts";

/** Um registro do mesmo ponto, como o chamador o entrega. */
export interface StopLocationRecord {
  id: string;
  mode: "live" | "later" | "memory";
  gps: PositionFix | null;
  recordedAt: number;
}

/**
 * A sugestão de guardar a localização do ponto (T-69). Conta só registros `live` com GPS de precisão até
 * `guardMaxAccuracyM`; usa os `guardMinRecords` mais recentes, que têm de ficar todos a até `guardMaxFromMedianM` da
 * mediana deles. `null` se o ponto já tem localização ou se a sugestão foi dispensada ("Agora não") e ainda não chegou
 * registro válido posterior ao dispensado. Um `dismissedAfterRecordId` que não está na lista é ignorado.
 */
export function suggestStopLocation(
  records: readonly StopLocationRecord[],
  stopHasLocation: boolean,
  dismissedAfterRecordId: string | null,
  config: DomainConfig = DOMAIN_CONFIG,
): { point: GeoPoint; recordIds: string[] } | null {
  if (stopHasLocation) return null;
  const valid = records
    .filter((r): r is StopLocationRecord & { gps: PositionFix } => r.mode === "live" && r.gps !== null && r.gps.accuracyM !== null && r.gps.accuracyM <= config.guardMaxAccuracyM)
    .sort((a, b) => b.recordedAt - a.recordedAt);
  const newest = valid[0];
  if (!newest) return null;
  // O registro dispensado conta pela lista completa: ele pode já não ser "válido" hoje, mas a dispensa vale a partir dele.
  const dismissed = dismissedAfterRecordId === null ? undefined : records.find((r) => r.id === dismissedAfterRecordId);
  if (dismissed && newest.recordedAt <= dismissed.recordedAt) return null;
  const recent = valid.slice(0, config.guardMinRecords);
  if (recent.length < config.guardMinRecords) return null;
  const point = medianPoint(recent.map((r) => r.gps));
  if (recent.some((r) => distanceM(r.gps, point) > config.guardMaxFromMedianM)) return null;
  return { point, recordIds: recent.map((r) => r.id) };
}

export type LocationCheck =
  | { ok: true }
  | { ok: true; farFromLeiria: true }
  | { ok: false; reason: "out_of_range" | "zero_point" | "imprecise" };

/**
 * Conferência da coordenada antes de gravar (T-70). Recusa fora da faixa (inclui `NaN` e infinito) e o par (0, 0); no
 * `manual` ("usar minha localização agora") recusa precisão `null` ou pior que `manualMaxAccuracyM`. Mais longe que
 * `farFromLeiriaM` do centro de Leiria, aceita mas avisa para o app perguntar.
 */
export function validateLocation(
  p: GeoPoint,
  accuracyM: number | null,
  source: "suggested" | "manual",
  config: DomainConfig = DOMAIN_CONFIG,
): LocationCheck {
  const inRange = Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  if (!inRange) return { ok: false, reason: "out_of_range" };
  if (p.lat === 0 && p.lon === 0) return { ok: false, reason: "zero_point" };
  if (source === "manual" && (accuracyM === null || accuracyM > config.manualMaxAccuracyM)) return { ok: false, reason: "imprecise" };
  if (distanceM(p, config.leiriaCenter) > config.farFromLeiriaM) return { ok: true, farFromLeiria: true };
  return { ok: true };
}
