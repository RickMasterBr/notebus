/** Arquivo com regras de negócio e validações de invariantes de percurso. */
/**
 * Invariantes da Fase 1 §3 que cabem no domínio sem casamento nem cálculo de horário (E-01 §4.7).
 * Cada função devolve `null` se está tudo certo, ou uma frase curta dizendo o que está errado.
 *
 * O 5 (Ride) entrou na E-03, com a passagem deduzida. Ficam para as etapas do cálculo:
 * - 6 (toda data tem um único tipo de dia) é o calendário → E-02.
 * - 7 (hora do aparelho sempre convertida para o fuso da rede) é o cálculo de horário → E-02.
 */

/**
 * Invariante 1: Verifica se as posições de um percurso formam uma sequência contínua (1...n).
 * Não pode haver buracos ou repetições para garantir uma ordem lógica nas paradas.
 *
 * @param positions - Array de números representando as posições
 * @returns Retorna a mensagem de erro se houver falha, ou `null` se estiver tudo certo.
 */
export function checkPatternPositions(positions: readonly number[]): string | null {
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) return `posição ${i + 1} esperada, encontrada ${sorted[i]}`;
  }
  return null;
}

/**
 * Invariante 2: Verifica se o tempo de serviço numa viagem é progressivo ou estático.
 * O ônibus não pode voltar no tempo ao avançar para a próxima posição.
 *
 * @param stopTimes - Tempos agendados com sua respectiva posição no percurso.
 * @returns Mensagem detalhando qual posição e minuto violou a ordem, ou `null`.
 */
export function checkTripTimes(
  stopTimes: readonly { position: number; serviceMinute: number }[],
): string | null {
  const sorted = [...stopTimes].sort((a, b) => a.position - b.position);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.serviceMinute < prev.serviceMinute) {
      return `pos. ${cur.position} (${cur.serviceMinute}) antes de pos. ${prev.position} (${prev.serviceMinute})`;
    }
  }
  return null;
}

/**
 * Invariante 3: Valida a lógica fundamental de uma viagem de ônibus.
 * O passageiro deve embarcar e desembarcar no mesmo percurso, e o desembarque
 * obrigatoriamente ocorre em uma posição adiante.
 *
 * @param board - Dados do local de embarque
 * @param alight - Dados do local de desembarque
 * @returns Mensagem se as condições falharem, ou `null`.
 */
export function checkBusOption(
  board: { patternId: string; position: number },
  alight: { patternId: string; position: number },
): string | null {
  if (board.patternId !== alight.patternId) return "embarque e descida em percursos diferentes";
  if (alight.position <= board.position) return "descida não vem depois do embarque";
  return null;
}

/**
 * Invariante 4: Valida um intervalo de observação garantindo coerência temporal.
 * O tempo final não pode anteceder o tempo inicial e o período completo é limitado a 30 minutos.
 *
 * @param observedAt - Instante inicial da observação (epoch ms)
 * @param observedEndAt - Instante final opcional (epoch ms)
 * @returns Mensagem se o intervalo for negativo ou estourar o limite, ou `null`.
 */
export function checkObservationInterval(observedAt: number, observedEndAt: number | null): string | null {
  if (observedEndAt === null) return null;
  if (observedEndAt < observedAt) return "fim antes do início";
  if (observedEndAt - observedAt > 30 * 60_000) return "intervalo maior que 30 min";
  return null;
}

/** Por que um par embarque/descida quebra o invariante 5 (códigos estáveis para a TL-06, E-04 §3.3). */
export type RideProblemCode = "pattern_differs" | "position_not_after" | "before_boarding";

const RIDE_PROBLEM_TEXT: Record<RideProblemCode, string> = {
  pattern_differs: "embarque e descida em percursos diferentes",
  position_not_after: "descida não vem depois do embarque",
  before_boarding: "descida antes do embarque",
};

/**
 * Invariante 5 pelo código: percurso igual, posição maior e hora maior ou igual (E-03 §4), nesta ordem.
 * `patternId` e `position` nulos (a passagem não foi deduzida) deixam só a hora a conferir.
 */
export function checkRideCode(
  board: { patternId: string | null; position: number | null; observedAt: number },
  alight: { patternId: string | null; position: number | null; observedAt: number },
): RideProblemCode | null {
  if (board.patternId !== null && alight.patternId !== null && board.position !== null && alight.position !== null) {
    if (board.patternId !== alight.patternId) return "pattern_differs";
    if (alight.position <= board.position) return "position_not_after";
  }
  if (alight.observedAt < board.observedAt) return "before_boarding";
  return null;
}

/**
 * Invariante 5: um `Ride` liga embarque e descida do **mesmo percurso**, com a descida em posição maior e hora
 * maior ou igual (E-03 §4). Cada lado é a passagem deduzida do registro e o seu instante (epoch ms).
 */
export function checkRide(
  board: { patternId: string; position: number; observedAt: number },
  alight: { patternId: string; position: number; observedAt: number },
): string | null {
  const code = checkRideCode(board, alight);
  return code === null ? null : RIDE_PROBLEM_TEXT[code];
}
