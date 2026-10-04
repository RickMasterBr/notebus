/**
 * Toast do app (E-03 bloco 2; 4.5 §2.1, §2.5, §2.6): um por vez, 5 s (8 s com VoiceOver), erro que não some sozinho.
 * As regras estão em `toastController.ts` (testadas no Node); aqui só ficam o React, o VoiceOver e o haptic.
 *
 * Haptic (D-044): sucesso ao gravar um embarque ou uma descida; erro no toast de erro; leve ao tocar numa ação (Desfazer).
 * Nunca por atualização automática: só `show` pedido por um gesto do usuário chega aqui. O sistema desliga a vibração
 * sozinho quando o ajuste do iPhone está desligado.
 */
import * as Haptics from "expo-haptics";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { type ToastController, type ToastSpec, type ToastState, createToastController } from "./toastController";

export interface ToastRequest extends Omit<ToastSpec, "screenReader"> {
  /** Haptic ao aparecer: `success` (embarque e descida gravados) ou `error` (o toast de erro). */
  haptic?: "success" | "error";
}

interface ToastValue {
  toast: ToastState | null;
  show: (request: ToastRequest) => void;
  /** Toque na ação do toast (o botão chama isto). */
  press: () => void;
  /** Dispensa o toast arrastando, sem acionar a ação (E-03 melhoria 3). */
  dismiss: () => void;
}

const ToastContext = createContext<ToastValue>({ toast: null, show: () => {}, press: () => {}, dismiss: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const screenReader = useRef(false);
  const controller = useRef<ToastController | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (alive) screenReader.current = on;
    });
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (on) => {
      screenReader.current = on;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (controller.current === null) {
    controller.current = createToastController<ReturnType<typeof setTimeout>>(
      { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle) },
      setToast,
    ) as ToastController;
  }

  const show = useCallback((request: ToastRequest) => {
    const { haptic, ...spec } = request;
    controller.current!.show({ ...spec, screenReader: screenReader.current });
    if (haptic === "success") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (haptic === "error") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // iOS não lê sozinho um texto que aparece: o toast é anunciado sem interromper o que o VoiceOver estava lendo.
    AccessibilityInfo.announceForAccessibility([spec.title, spec.body].filter(Boolean).join(". "));
  }, []);

  const press = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    controller.current!.press();
  }, []);

  const dismiss = useCallback(() => {
    controller.current!.dismiss();
  }, []);

  const value = useMemo(() => ({ toast, show, press, dismiss }), [toast, show, press, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
