/**
 * T-57: o iOS entrega `notification.date` em **segundos** (S-01); o resto do app usa milissegundos. Esta é a única
 * conversão, e `expoPort.ts` o único lugar que lê `.date` de uma notificação.
 *
 * Limite: 1e11 ms é março de 1973 e 1e11 s é o ano 5138. Valores abaixo disso são segundos.
 */
const SECONDS_LIMIT = 1e11;

export function nativeDateToMs(raw: number): number {
  return raw < SECONDS_LIMIT ? Math.round(raw * 1000) : raw;
}
