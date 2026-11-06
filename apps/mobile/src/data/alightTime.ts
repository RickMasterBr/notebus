/**
 * A hora de uma descida anotada depois (D-418, ideia 165). Puro: sem banco, sem relógio (o instante vem de quem chama).
 *
 * A descida é sempre da paragem que o usuário tocou (D-022): a "hora esperada" é o centro daquela paragem, e o atraso
 * entre ele e o minuto agora é o tempo que passou desde que o ônibus lá esteve. Até 5 min de atraso ainda é o toque ao
 * vivo (`live`); mais do que isso, a descida é anotada depois (`later`) e vale a hora esperada da paragem.
 */
export const LATE_ALIGHT_MIN = 5;

/**
 * `expectedMinute` = minutos de serviço da paragem tocada (`AlightRow.minute`, com decimais); `nowMinute` = minuto de
 * serviço agora (`serviceMinuteOn`, com decimais); `now` = o instante do toque. Sem um dos minutos não há atraso a
 * medir: grava ao vivo, na hora do toque.
 */
export function alightRecordTime(input: {
  expectedMinute: number | null;
  nowMinute: number | null;
  now: number;
}): { observedAt: number; mode: "live" | "later" } {
  const { expectedMinute, nowMinute, now } = input;
  if (expectedMinute !== null && nowMinute !== null && nowMinute - expectedMinute > LATE_ALIGHT_MIN) {
    return { observedAt: now - Math.round((nowMinute - expectedMinute) * 60_000), mode: "later" };
  }
  return { observedAt: now, mode: "live" };
}
