/**
 * Relógio injetável (E-02 §4.5, D-095): o app nunca chama `new Date()` / `Date.now()` direto; pede "agora" aqui.
 * Por padrão é o relógio real. O bloco 5 troca por um relógio de teste (`NowProvider source={...}`).
 * TypeScript puro para ser testado no Node; o provedor React está em `NowProvider.tsx`.
 */
import { lisbonWallClock, type WallClock } from "@notebus/domain";

/** Devolve o instante atual em milissegundos (epoch UTC). */
export type NowSource = () => number;

export const realNow: NowSource = () => Date.now();

/** Data e minuto de Lisboa segundo o relógio dado (hora de serviço: ver `serviceDaysAt`). */
export function wallClockNow(source: NowSource): WallClock {
  return lisbonWallClock(source());
}
