/**
 * Relógio injetável (E-02 §4.5, D-095): o app nunca chama `new Date()` / `Date.now()` direto; pede "agora" aqui.
 * Por padrão é o relógio real. O relógio de teste (`createTestClock`) devolve um instante escolhido enquanto ligado.
 * Este é o único arquivo do app que lê o relógio do aparelho (o teste `noDirectClock.test.ts` confere).
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

const MINUTE_MS = 60_000;

/** Hora de parede em Lisboa → instante (ms UTC). Hora repetida de outubro: vale a primeira; hora que falta em março: vale a seguinte. */
export function wallClockToInstant(wall: WallClock): number {
  const base = Date.UTC(Number(wall.date.slice(0, 4)), Number(wall.date.slice(5, 7)) - 1, Number(wall.date.slice(8, 10))) + wall.minute * MINUTE_MS;
  for (const offset of [3_600_000, 0]) {
    const candidate = base - offset;
    const back = lisbonWallClock(candidate);
    if (back.date === wall.date && back.minute === wall.minute) return candidate;
  }
  return base;
}

/**
 * Relógio de teste (D-095): desligado, repassa o relógio real; ligado, devolve sempre o instante escolhido (parado,
 * para a tela do teste não mudar sozinha). Vive só na memória: fechar o app o desliga (nada é gravado).
 */
export interface TestClock {
  /** Use como `NowProvider source`. */
  now: NowSource;
  isOn(): boolean;
  /** Instante escolhido, ou `null` se desligado. */
  chosen(): number | null;
  /** Liga (ou troca) o relógio de teste para a data e o minuto de parede em Lisboa. */
  set(wall: WallClock): void;
  /** Liga (ou troca) para um instante exato. */
  setInstant(instantMs: number): void;
  turnOff(): void;
}

export function createTestClock(real: NowSource = realNow): TestClock {
  let fixed: number | null = null;
  return {
    now: () => fixed ?? real(),
    isOn: () => fixed !== null,
    chosen: () => fixed,
    set: (wall) => {
      fixed = wallClockToInstant(wall);
    },
    setInstant: (instantMs) => {
      fixed = instantMs;
    },
    turnOff: () => {
      fixed = null;
    },
  };
}
