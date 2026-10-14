/**
 * Decisão de qual cartão de guia do Início aparece (D-196, D-202, T-136, ux/4.8 §5.2).
 * Função pura, sem React e sem banco.
 */

export type HomeGuideKind = "line" | "register" | "mobilis";

export interface HomeGuideDecision {
  kind: HomeGuideKind;
  dismissible: boolean;
}

export interface HomeGuideInput {
  hasDataset: boolean;
  stopCount: number;
  lineCount: number;
  recordCount: number;
  dismissed: boolean;
}

export function homeGuide({
  hasDataset,
  stopCount,
  lineCount,
  recordCount,
  dismissed,
}: HomeGuideInput): HomeGuideDecision | null {
  // G1: !hasDataset, stopCount >= 1, lineCount === 0 -> line, dismissible: false
  if (!hasDataset && stopCount >= 1 && lineCount === 0) {
    return { kind: "line", dismissible: false };
  }

  // G2: !hasDataset, lineCount >= 1, recordCount === 0, !dismissed -> register, dismissible: true
  if (!hasDataset && lineCount >= 1 && recordCount === 0 && !dismissed) {
    return { kind: "register", dismissible: true };
  }

  // G3: hasDataset, recordCount === 0, !dismissed -> mobilis, dismissible: true
  if (hasDataset && recordCount === 0 && !dismissed) {
    return { kind: "mobilis", dismissible: true };
  }

  return null;
}
