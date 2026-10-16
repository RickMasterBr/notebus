/**
 * Folha fantasma (FN-14): a pilha diz que a folha é a do topo, mas ela não está desenhada. Regra pura (sem React):
 * detecta o sintoma depois que a folha volta a ser a do topo e diz qual passo de reparo tentar.
 */

export interface GhostInput {
  /** A pilha diz que esta folha é a do topo. */
  isTop: boolean;
  /** A folha já foi coberta por outra antes. */
  hasBeenCovered: boolean;
  /** `animatedPosition` da biblioteca (px a partir do topo da tela onde a folha começa). */
  position: number;
  /** `animatedIndex` da biblioteca (-1 = fechada). */
  index: number;
  screenHeight: number;
  /** Índice em que a folha deveria estar (o `initialIndex`). */
  expectedIndex: number;
}

/** Folha fora da tela: a posição está a menos de 4 px do fim da tela ou além dele. */
const OFFSCREEN_MARGIN = 4;

export function isGhostSuspect({ isTop, hasBeenCovered, position, index, screenHeight, expectedIndex }: GhostInput): boolean {
  if (!isTop || !hasBeenCovered) return false;
  return position >= screenHeight - OFFSCREEN_MARGIN || index !== expectedIndex;
}

export type RepairStep = "snap" | "remount" | "stop";

/** 0 → reabrir pela biblioteca; 1 → remontar o `BottomSheet`; depois, parar. */
export function repairStep(attempt: number): RepairStep {
  if (attempt === 0) return "snap";
  if (attempt === 1) return "remount";
  return "stop";
}
