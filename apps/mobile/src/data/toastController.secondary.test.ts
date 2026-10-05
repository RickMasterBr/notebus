import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ToastState, TOAST_MS, createToastController } from "./toastController";

function setup() {
  const seen: (ToastState | null)[] = [];
  const controller = createToastController<ReturnType<typeof setTimeout>>(
    { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
    (t) => seen.push(t),
  );
  const visible = () => controller.current?.title ?? null;
  return { controller, visible, seen };
}

describe("toast secondary action", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("toast com duas ações: secondaryAction está disponível", () => {
    const { controller } = setup();
    const runPrimary = vi.fn();
    const runSecondary = vi.fn();
    controller.show({
      title: "Embarque registrado",
      action: { label: "Desfazer", run: runPrimary },
      secondaryAction: { label: "Ajustar", run: runSecondary },
    });
    expect(controller.current?.action?.label).toBe("Desfazer");
    expect(controller.current?.secondaryAction?.label).toBe("Ajustar");
  });

  it("pressSecondary: cancela temporizador, toast some na hora e ação roda uma vez", () => {
    const { controller, visible } = setup();
    const runSecondary = vi.fn();
    controller.show({
      title: "Embarque registrado",
      action: { label: "Desfazer", run: vi.fn() },
      secondaryAction: { label: "Ajustar", run: runSecondary },
    });
    vi.advanceTimersByTime(1200);
    controller.pressSecondary();
    expect(visible()).toBeNull();
    expect(runSecondary).toHaveBeenCalledTimes(1);

    // Toque duplicado não roda de novo
    controller.pressSecondary();
    vi.advanceTimersByTime(10_000);
    expect(runSecondary).toHaveBeenCalledTimes(1);
  });

  it("pressSecondary sem secondaryAction não quebra nem fecha o toast", () => {
    const { controller, visible } = setup();
    controller.show({
      title: "Só uma ação",
      action: { label: "Desfazer", run: vi.fn() },
    });
    controller.pressSecondary();
    expect(visible()).toBe("Só uma ação");
  });

  it("press na ação primária não dispara a secundária", () => {
    const { controller, visible } = setup();
    const runPrimary = vi.fn();
    const runSecondary = vi.fn();
    controller.show({
      title: "Embarque",
      action: { label: "Desfazer", run: runPrimary },
      secondaryAction: { label: "Ajustar", run: runSecondary },
    });
    controller.press();
    expect(visible()).toBeNull();
    expect(runPrimary).toHaveBeenCalledTimes(1);
    expect(runSecondary).not.toHaveBeenCalled();
  });
});
