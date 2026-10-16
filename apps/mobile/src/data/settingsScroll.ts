/**
 * Regras de rolagem da folha Ajustes (TL-12, FN-18 e FN-19).
 * Função pura em TypeScript, testada sem React nem DOM.
 */

export interface SettingsScrollDecision {
  /** Deslocamento a ser armazenado para a lista raiz. */
  saveOffset: number;
  /** Deslocamento a restaurar na lista raiz (ou null se não deve restaurar). */
  restoreOffset: number | null;
}

/**
 * Calcula se deve guardar ou restaurar a rolagem da lista raiz dos Ajustes.
 *
 * @param fromPage Página de origem (ou null/closed ao fechar)
 * @param toPage Página de destino (ou null/closed ao fechar)
 * @param savedOffset Deslocamento atual medido ou guardado
 */
export function resolveSettingsScroll(
  fromPage: string | null | undefined,
  toPage: string | null | undefined,
  savedOffset: number,
): SettingsScrollDecision {
  // Ao fechar a folha o valor guardado zera
  if (!toPage || toPage === "closed") {
    return { saveOffset: 0, restoreOffset: null };
  }

  // Ao sair de root para uma página, guarda o deslocamento da lista
  if (fromPage === "root" && toPage !== "root") {
    return { saveOffset: savedOffset, restoreOffset: null };
  }

  // Ao voltar para root, restaura exatamente esse valor (sem animação)
  if (fromPage !== "root" && toPage === "root") {
    return { saveOffset: savedOffset, restoreOffset: savedOffset };
  }

  // De uma página para outra página não restaura nada
  return { saveOffset: savedOffset, restoreOffset: null };
}
