/** Utilitários para trabalhar com minutos de serviço absolutos e sua conversão para HH:MM. */
/**
 * Converte um minuto de serviço absoluto (D-016) no formato legível "HH:MM".
 * Permite horas >= 24h para indicar viagens que ocorrem logo após a meia-noite
 * sem quebrar a sequência temporal do dia de serviço (ex: 25:15 = 01:15 do dia seguinte).
 *
 * @param minute - Minutos acumulados desde o início do dia de serviço.
 * @returns Horário no formato "HH:MM"
 */
export function formatServiceMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
