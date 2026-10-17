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
  /** Retângulo medido na janela (`measureInWindow`); ausente ou `null` = sem medida, vale só posição e índice. */
  measured?: { top: number; height: number } | null;
}

/** Espera, em ms, entre a folha voltar a ser a do topo e a conferência (e entre as tentativas de reparo). */
export const REVEAL_CHECK_MS = 350;

/** Último índice em que a folha assentou: `next` se for um detent (>= 0), senão `previous` (-1 é fechada, não detent). */
export function settledIndex(previous: number, next: number): number {
  return next >= 0 ? next : previous;
}

/** Folha fora da tela: a posição está a menos de 4 px do fim da tela ou além dele. */
const OFFSCREEN_MARGIN = 4;
/** Folha medida: o topo a menos de 50 px do fim da tela já não mostra a folha. */
const MEASURED_OFFSCREEN_MARGIN = 50;

/** Por que a folha é suspeita: `"medida"` = só a medida acusa (posição e índice normais); `"posicao"` = qualquer outro caso; `null` = não é suspeita. */
export type GhostReason = "medida" | "posicao";

export function ghostReason({ isTop, hasBeenCovered, position, index, screenHeight, expectedIndex, measured }: GhostInput): GhostReason | null {
  if (!isTop || !hasBeenCovered) return null;
  if (position >= screenHeight - OFFSCREEN_MARGIN || index !== expectedIndex) return "posicao";
  // A biblioteca diz "aberta" (E-09 bloco 29): confere o que está na tela de fato.
  return !!measured && (measured.height <= 0 || measured.top >= screenHeight - MEASURED_OFFSCREEN_MARGIN) ? "medida" : null;
}

export function isGhostSuspect(input: GhostInput): boolean {
  return ghostReason(input) !== null;
}

export type RepairStep = "snap" | "remount" | "stop";

/** Motivo "posicao": 0 → reabrir pela biblioteca; 1 → remontar o `BottomSheet`; depois, parar. Motivo "medida" (a biblioteca já mentiu, reabrir não adianta): 0 → remontar; depois, parar. */
export function repairStep(attempt: number, reason: GhostReason = "posicao"): RepairStep {
  if (reason === "medida") return attempt === 0 ? "remount" : "stop";
  if (attempt === 0) return "snap";
  if (attempt === 1) return "remount";
  return "stop";
}
