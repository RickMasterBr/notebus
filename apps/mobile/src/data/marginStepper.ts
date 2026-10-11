/**
 * Stepper de margem com coalescência de toques (D1, E-08 bloco 1d).
 * Função pura, sem React nem relógio.
 */
import { stepMargin } from "./settingsView";

export interface MarginStepperOptions {
  initial: number;
  write: (value: number) => Promise<boolean>;
  show: (value: number) => void;
}

export interface MarginStepper {
  step: (direction: 1 | -1) => void;
  sync: (confirmed: number) => void;
  isBusy: () => boolean;
  shown: () => number;
}

export function createMarginStepper({ initial, write, show }: MarginStepperOptions): MarginStepper {
  let confirmed = initial;
  let currentShown = initial;
  let pendingTarget: number | null = null;
  let busy = false;

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

  function step(direction: 1 | -1): void {
    const next = stepMargin(currentShown, direction);
    if (next.value === currentShown) {
      return;
    }
    currentShown = next.value;
    show(currentShown);
    pendingTarget = currentShown;

    if (!busy) {
      void run();
    }
  }

  function sync(confirmado: number): void {
    if (busy || pendingTarget !== null) {
      return;
    }
    confirmed = confirmado;
    currentShown = confirmado;
    show(confirmado);
  }

  return {
    step,
    sync,
    isBusy: () => busy || pendingTarget !== null,
    shown: () => currentShown,
  };
}
