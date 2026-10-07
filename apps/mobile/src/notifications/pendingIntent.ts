/**
 * O que o toque numa notificação pede para a tela fazer quando o app abrir (E-06 §4.3, §5.3). Só na memória: quem consome
 * é a tela (`adjust` agora; `goto` no bloco 3). Um intento por vez; o último vence.
 */
export type PendingIntent = { kind: "goto"; placeId: string } | { kind: "adjust"; observationId: string };

let pending: PendingIntent | null = null;
const listeners = new Set<() => void>();

export function setPendingIntent(intent: PendingIntent): void {
  pending = intent;
  notifyPendingIntent();
}

/** Chama quem consome de novo, sem mudar o intento (por exemplo, quando as folhas acabaram de montar). */
export function notifyPendingIntent(): void {
  listeners.forEach((l) => l());
}

/** Devolve o intento e o esquece. */
export function takePendingIntent(): PendingIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}

export function peekPendingIntent(): PendingIntent | null {
  return pending;
}

/** Avisa quem consome quando chega um intento com o app já aberto. Devolve o `remove`. */
export function onPendingIntent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
