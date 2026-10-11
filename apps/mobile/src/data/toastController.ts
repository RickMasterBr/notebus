/**
 * Regras do toast (E-03 bloco 2; 4.5 §2.1 D-039, §2.5 D-043, §2.6 D-044): um toast por vez, o novo substitui o
 * anterior; some sozinho em 5 s (8 s com VoiceOver ligado) e na hora ao tocar numa ação; o de erro **não some sozinho**.
 * Puro (sem React): os temporizadores entram por parâmetro, para o teste usar um relógio falso.
 */

export const TOAST_MS = 5000;
export const TOAST_MS_SCREEN_READER = 8000;
/** Aviso com ação (o Desfazer): fica mais tempo, para dar tempo de tocar (E-08 bloco 5, D11). */
export const TOAST_MS_ACTION = 8000;
export const TOAST_MS_ACTION_SCREEN_READER = 12000;

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

/** Quanto tempo o aviso fica na tela: com ação 8 s (12 s com VoiceOver), sem ação 5 s (8 s com VoiceOver). */
export function toastDuration(spec: Pick<ToastSpec, "action" | "screenReader">): number {
  if (spec.action) return spec.screenReader ? TOAST_MS_ACTION_SCREEN_READER : TOAST_MS_ACTION;
  return spec.screenReader ? TOAST_MS_SCREEN_READER : TOAST_MS;
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
      const { screenReader: _screenReader, ...rest } = spec;
      const toast: ToastState = { ...rest, id: nextId++ };
      set(toast);
      if (spec.kind !== "error") {
        handle = timers.set(() => {
          handle = null;
          if (current?.id === toast.id) set(null);
        }, toastDuration(spec));
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
