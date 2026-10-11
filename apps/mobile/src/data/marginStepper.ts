/**
 * Stepper de margem com coalescência de toques (D1, E-08 bloco 1d).
 * Função pura, sem React nem relógio.
 */
import { stepMargin } from "./settingsView";

/** Ação de acessibilidade do VoiceOver (`increment`/`decrement`) para o passo da margem; outra ação não faz nada. */
export function adjustableStep(actionName: string): 1 | -1 | null {
  if (actionName === "increment") return 1;
  if (actionName === "decrement") return -1;
  return null;
}

/** Gravar só depois de `ms` sem toque (E-08 boost da margem). O agendador vem de fora: nunca `setTimeout` direto aqui (D-095). */
export interface MarginDebounce {
  ms: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface MarginStepperOptions {
  initial: number;
  write: (value: number) => Promise<boolean>;
  show: (value: number) => void;
  /** Sem isto, cada toque grava na hora (comportamento do bloco 1d). */
  debounce?: MarginDebounce;
}

export interface MarginStepper {
  step: (direction: 1 | -1) => void;
  sync: (confirmed: number) => void;
  /** Grava já o que espera o fim da rajada (ex.: a folha fechou antes dos 500 ms). */
  flush: () => void;
  isBusy: () => boolean;
  shown: () => number;
}

export function createMarginStepper({ initial, write, show, debounce }: MarginStepperOptions): MarginStepper {
  let confirmed = initial;
  let currentShown = initial;
  let pendingTarget: number | null = null;
  let busy = false;
  let timer: unknown = null;
  let timerArmed = false;


  async function run(): Promise<void> {
    busy = true;
    while (pendingTarget !== null) {
      const toWrite = pendingTarget;
      pendingTarget = null;

      if (toWrite === confirmed) {
        continue;
      }

      try {
        const ok = await write(toWrite);
        if (!ok) {
          pendingTarget = null;
          currentShown = confirmed;
          show(currentShown);
          break;
        }
        confirmed = toWrite;
      } catch {
        pendingTarget = null;
        currentShown = confirmed;
        show(currentShown);
        break;
      }
    }
    busy = false;
  }

  function fire(): void {
    timerArmed = false;
    timer = null;
    pendingTarget = currentShown;
    if (!busy) {
      void run();
    }
  }

  function step(direction: 1 | -1): void {
    const next = stepMargin(currentShown, direction);
    if (next.value === currentShown) {
      return;
    }
    currentShown = next.value;
    show(currentShown);

    if (debounce) {
      if (timerArmed) {
        debounce.clearTimer(timer);
      }
      timerArmed = true;
      timer = debounce.setTimer(fire, debounce.ms);
      return;
    }

    pendingTarget = currentShown;

    if (!busy) {
      void run();
    }
  }

  function flush(): void {
    if (debounce && timerArmed) {
      debounce.clearTimer(timer);
      fire();
    }
  }

  function sync(confirmado: number): void {
    if (busy || pendingTarget !== null || timerArmed) {
      return;
    }
    confirmed = confirmado;
    currentShown = confirmado;
    show(confirmado);
  }

  return {
    step,
    sync,
    flush,
    isBusy: () => busy || pendingTarget !== null || timerArmed,
    shown: () => currentShown,
  };
}

