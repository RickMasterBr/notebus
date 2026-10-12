import { snoozeUntil } from "@notebus/domain";

/**
 * Até quando o "Agora não" esconde o cartão de backup (E8a, H1). O cartão decide com o instante que ele mostra
 * (`shownAt`, que só anda quando o minuto vira); medir o adiamento no toque exato, depois dele, faz o domínio tratar
 * o adiamento como vencido até o minuto virar. Por isso vale o menor dos dois.
 */
export function reminderSnoozeUntil(input: { pressAt: number; shownAt: number }): number {
  return snoozeUntil(Math.min(input.pressAt, input.shownAt));
}
