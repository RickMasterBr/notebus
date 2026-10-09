/**
 * Espera a primeira leitura do GPS ao tocar no botão "onde estou" (E-07 Bloco 5, Item 0.2).
 * Puro: sem timers reais (recebe sleep/timeout).
 */
import type { PositionFix } from "@notebus/domain";

export const MAP_LOCATE_FIRST_FIX_TIMEOUT_MS = 3_000;

export interface WaitForPositionFixInput {
  getFix: () => PositionFix | null;
  subscribeFix: (listener: () => void) => () => void;
  warm?: () => Promise<void> | void;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function waitForPositionFix(input: WaitForPositionFixInput): Promise<PositionFix | null> {
  const immediateFix = input.getFix();
  if (immediateFix !== null) {
    return immediateFix;
  }

  if (input.warm) {
    void input.warm();
  }

  const timeoutMs = input.timeoutMs ?? MAP_LOCATE_FIRST_FIX_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const timeoutPromise = new Promise<void>((resolve) => {
    if (input.sleep) {
      void input.sleep(timeoutMs).then(resolve);
    } else {
      timer = setTimeout(resolve, timeoutMs);
    }
  });

  const fixPromise = new Promise<void>((resolve) => {
    unsubscribe = input.subscribeFix(() => {
      if (input.getFix() !== null) {
        resolve();
      }
    });
  });

  await Promise.race([timeoutPromise, fixPromise]);
  if (timer !== undefined) clearTimeout(timer);
  if (unsubscribe) unsubscribe();

  return input.getFix();
}
