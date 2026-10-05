/**
 * Regras do toast (E-03 bloco 2; 4.5 §2.1 D-039, §2.5 D-043, §2.6 D-044): um toast por vez, o novo substitui o
 * anterior; some sozinho em 5 s (8 s com VoiceOver ligado) e na hora ao tocar numa ação; o de erro **não some sozinho**.
 * Puro (sem React): os temporizadores entram por parâmetro, para o teste usar um relógio falso.
 */

export const TOAST_MS = 5000;
export const TOAST_MS_SCREEN_READER = 8000;

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastSpec {
  title: string;
  body?: string;
  /** `error`: não some sozinho (um erro que some em 5 s pode não ser visto por quem registra sem olhar a tela). */
  kind?: "info" | "error";
  action?: ToastAction;
  secondaryAction?: ToastAction;
  /** O VoiceOver está ligado: 8 s em vez de 5 s. */
  screenReader?: boolean;
}

export interface ToastState extends Omit<ToastSpec, "screenReader"> {
  /** Muda a cada toast, mesmo com o mesmo texto: é a chave que faz a animação de entrada rodar de novo. */
  id: number;
}

export interface ToastTimers<Handle> {
  set: (fn: () => void, ms: number) => Handle;
  clear: (handle: Handle) => void;
}

export function createToastController<Handle>(timers: ToastTimers<Handle>, onChange: (toast: ToastState | null) => void) {
  let current: ToastState | null = null;
  let handle: Handle | null = null;
  let nextId = 1;

  function cancel() {
    if (handle !== null) timers.clear(handle);
    handle = null;
  }
  function set(next: ToastState | null) {
    current = next;
    onChange(next);
  }

  return {
    show(spec: ToastSpec): number {
      cancel();
      const { screenReader, ...rest } = spec;
      const toast: ToastState = { ...rest, id: nextId++ };
      set(toast);
      if (spec.kind !== "error") {
        handle = timers.set(() => {
          handle = null;
          if (current?.id === toast.id) set(null);
        }, screenReader ? TOAST_MS_SCREEN_READER : TOAST_MS);
      }
      return toast.id;
    },
    /** Toque na ação: o toast some na hora, depois a ação roda (ela pode mostrar outro toast). */
    press(): void {
      const action = current?.action;
      if (!action) return;
      cancel();
      set(null);
      action.run();
    },
    pressSecondary(): void {
      const action = current?.secondaryAction;
      if (!action) return;
      cancel();
      set(null);
      action.run();
    },
    dismiss(): void {
      cancel();
      set(null);
    },
    get current(): ToastState | null {
      return current;
    },
  };
}

export type ToastController = ReturnType<typeof createToastController<unknown>>;
