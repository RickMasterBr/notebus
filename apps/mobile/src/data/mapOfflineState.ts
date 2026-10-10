/**
 * Estado e utilitários puros do mapa offline (E-07 7b Bloco 6a, D-106).
 * Sem React, sem MapLibre.
 */

export const OFFLINE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // D-106: "Agora não" some por 7 dias
export const OFFLINE_SNOOZED_UNTIL = "offline_map_snoozed_until"; // chave em `setting`

export const OFFLINE_PACK_LIGHT = "leiria-light";
export const OFFLINE_PACK_DARK = "leiria-dark";

export type OfflineMapStatus =
  | { kind: "none" }
  | { kind: "downloading"; percent: number } // 0 a 100, inteiro
  | { kind: "ready"; bytes: number }
  | { kind: "error" };

/**
 * Decide se a oferta de download do mapa offline deve ser exibida.
 * Regras: só true com mapVisible, status 'none' ou 'error', e sem soneca vigente.
 */
export function shouldOfferOfflineMap(input: {
  status: OfflineMapStatus;
  mapVisible: boolean; // o mapa carregou (não caiu no fundo neutro)
  snoozedUntilMs: number | null;
  nowMs: number;
}): boolean {
  if (!input.mapVisible) return false;
  if (input.status.kind !== "none" && input.status.kind !== "error") return false;
  if (input.snoozedUntilMs !== null && input.nowMs < input.snoozedUntilMs) return false;
  return true;
}

/** Retorna o instante em que a soneca deve expirar a partir de nowMs (7 dias). */
export function snoozedUntil(nowMs: number): number {
  return nowMs + OFFLINE_SNOOZE_MS;
}

/** Calcula porcentagem inteira de 0 a 100. Total <= 0 devolve 0; nunca passa de 100. */
export function percentOf(done: number, total: number): number {
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return 100;
  return Math.min(100, Math.max(0, Math.floor((done / total) * 100)));
}

/** Formata bytes em megabytes com 1 casa decimal e vírgula (ex.: 9_542_041 -> '9,1'). */
export function megabytesText(bytes: number): string {
  if (bytes <= 0) return "0,0";
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1).replace(".", ",");
}

export const OFFLINE_KB_PER_TILE = 80; // medido no iPhone em 10/10/26: 180 tiles, 2 pacotes, 14,1 MB

/** Estima o tamanho em MB a partir do número de tiles: tileCount * OFFLINE_KB_PER_TILE / 1024, uma casa decimal. */
export function estimateMegabytes(tileCount: number): number {
  if (tileCount <= 0) return 0;
  const raw = (tileCount * OFFLINE_KB_PER_TILE) / 1024;
  return Math.round(raw * 10) / 10;
}

export type ProgressPart =
  | number
  | { done: number; total: number }
  | { percentage: number }
  | { completedResourceCount: number; requiredResourceCount: number };

/** Combina o progresso de múltiplos pacotes em uma porcentagem inteira (0..100). */
export function combineProgress(parts: readonly ProgressPart[]): number {
  if (parts.length === 0) return 0;
  const first = parts[0];
  if (
    typeof first === "object" &&
    first !== null &&
    "done" in first &&
    "total" in first
  ) {
    let totalDone = 0;
    let totalAll = 0;
    for (const part of parts as readonly { done: number; total: number }[]) {
      totalDone += Math.max(0, part.done);
      totalAll += Math.max(0, part.total);
    }
    return percentOf(totalDone, totalAll);
  }
  if (
    typeof first === "object" &&
    first !== null &&
    "completedResourceCount" in first &&
    "requiredResourceCount" in first
  ) {
    let totalDone = 0;
    let totalAll = 0;
    for (const part of parts as readonly { completedResourceCount: number; requiredResourceCount: number }[]) {
      totalDone += Math.max(0, part.completedResourceCount);
      totalAll += Math.max(0, part.requiredResourceCount);
    }
    return percentOf(totalDone, totalAll);
  }
  let sum = 0;
  for (const part of parts) {
    if (typeof part === "number") {
      sum += Math.min(100, Math.max(0, part));
    } else if (typeof part === "object" && part !== null && "percentage" in part) {
      sum += Math.min(100, Math.max(0, part.percentage));
    }
  }
  return percentOf(sum, parts.length * 100);
}

/** Representação dos dados de um pacote para cálculo de status puro. */
export interface OfflinePackSnapshot {
  id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  state: "inactive" | "active" | "complete" | "error";
  percentage?: number;
  completedResourceSize?: number;
}

/**
 * Transforma a lista de pacotes devolvida pelo MapLibre em OfflineMapStatus:
 * - 'ready' se os dois pacotes (leiria-light e leiria-dark) existem e estão completos, com a soma dos bytes;
 * - 'none' se nenhum ou incompleto sem estar em andamento;
 * - 'downloading' se algum está em andamento (active);
 * - 'error' se algum falhou (error).
 */
export function statusFromPacks(packs: readonly OfflinePackSnapshot[]): OfflineMapStatus {
  if (packs.length === 0) return { kind: "none" };

  if (packs.some((p) => p.state === "error")) {
    return { kind: "error" };
  }

  const hasActive = packs.some((p) => p.state === "active");
  if (hasActive) {
    const percentages = packs.map((p) => p.percentage ?? 0);
    return { kind: "downloading", percent: combineProgress(percentages) };
  }

  const lightPack = packs.find(
    (p) =>
      p.name === OFFLINE_PACK_LIGHT ||
      p.metadata?.name === OFFLINE_PACK_LIGHT ||
      p.metadata?.id === OFFLINE_PACK_LIGHT,
  );
  const darkPack = packs.find(
    (p) =>
      p.name === OFFLINE_PACK_DARK ||
      p.metadata?.name === OFFLINE_PACK_DARK ||
      p.metadata?.id === OFFLINE_PACK_DARK,
  );

  if (lightPack?.state === "complete" && darkPack?.state === "complete") {
    const bytes = (lightPack.completedResourceSize ?? 0) + (darkPack.completedResourceSize ?? 0);
    return { kind: "ready", bytes };
  }

  return { kind: "none" };
}
