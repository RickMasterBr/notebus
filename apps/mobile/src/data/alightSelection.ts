/**
 * Lógica pura da escolha de descida (E-05 §4.1, D-065, T-48).
 *
 * (a) só paragens após o embarque, na ordem do percurso.
 * (b) a passagem repetida vem marcada "2ª passagem · segue para ...".
 * (c) trocar a descida liga o "para conferir" de "a pé depois da descida", e mexer no valor ou gravar o desliga.
 */

/**
 * (a) Filtra apenas as paragens que vêm após a posição de embarque, preservando a ordem do percurso.
 */
export function filterAlightStops<T extends { position: number }>(
  stops: readonly T[],
  boardPosition: number,
): T[] {
  return stops
    .filter((s) => s.position > boardPosition)
    .sort((a, b) => a.position - b.position);
}

export interface AlightSubtitleInput {
  passageNumber: number | null;
  isLast: boolean;
  destinationName?: string;
}

/**
 * (b) Devolve o subtítulo da paragem de descida:
 * - Se a passagem é repetida (número > 1), "2ª passagem · segue para <destino>".
 * - Se é a última do percurso, "fim do percurso".
 * - Caso contrário, null.
 */
export function formatAlightSubtitle(
  input: AlightSubtitleInput,
  formatPass: (ordinal: string, dest: string) => string,
  endOfRouteText: string,
): string | null {
  if (input.passageNumber && input.passageNumber > 1) {
    return formatPass(`${input.passageNumber}ª`, input.destinationName ?? "");
  }
  if (input.isLast) {
    return endOfRouteText;
  }
  return null;
}

export interface WalkCheckState {
  initialAlightPatternStopId?: string | null;
  currentAlightPatternStopId?: string | null;
  walkValueEdited?: boolean;
  isSaved?: boolean;
}

/**
 * (c) Determina se a marca "para conferir" do tempo a pé depois da descida deve estar ligada.
 * - Ligar: quando a paragem de descida é trocada em relação à original (ou selecionada).
 * - Desligar: quando o usuário mexe no valor do tempo a pé ou quando grava a opção.
 */
export function shouldCheckWalkAfterAlight(state: WalkCheckState): boolean {
  if (state.isSaved) return false;
  if (state.walkValueEdited) return false;
  if (!state.currentAlightPatternStopId) return false;
  if (state.initialAlightPatternStopId === undefined) return false;
  return state.currentAlightPatternStopId !== state.initialAlightPatternStopId;
}
