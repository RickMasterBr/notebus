/**
 * Invariantes da Fase 1 §3 que cabem no domínio sem casamento nem cálculo de horário (E-01 §4.7).
 * Cada função devolve `null` se está tudo certo, ou uma frase curta dizendo o que está errado.
 *
 * Ficam para as etapas do cálculo:
 * - 5 (Ride: desembarque depois do embarque no mesmo percurso) depende da passagem deduzida → E-03.
 * - 6 (toda data tem um único tipo de dia) é o calendário → E-02.
 * - 7 (hora do aparelho sempre convertida para o fuso da rede) é o cálculo de horário → E-02.
 */

/** Invariante 1: as posições de um percurso são 1…n, sem buracos e sem repetição. */
export function checkPatternPositions(positions: readonly number[]): string | null {
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) return `posição ${i + 1} esperada, encontrada ${sorted[i]}`;
  }
  return null;
}

/** Invariante 2: os horários de uma viagem não diminuem ao longo das posições. */
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

/** Invariante 3: numa opção de ônibus, a descida vem depois do embarque, no mesmo percurso. */
export function checkBusOption(
  board: { patternId: string; position: number },
  alight: { patternId: string; position: number },
): string | null {
  if (board.patternId !== alight.patternId) return "embarque e descida em percursos diferentes";
  if (alight.position <= board.position) return "descida não vem depois do embarque";
  return null;
}

/** Invariante 4: observação em intervalo tem início ≤ fim e no máximo 30 min. Instantes em epoch ms. */
export function checkObservationInterval(observedAt: number, observedEndAt: number | null): string | null {
  if (observedEndAt === null) return null;
  if (observedEndAt < observedAt) return "fim antes do início";
  if (observedEndAt - observedAt > 30 * 60_000) return "intervalo maior que 30 min";
  return null;
}
