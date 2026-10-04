import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ToastState, TOAST_MS, TOAST_MS_SCREEN_READER, createToastController } from "./toastController";

// Relógio falso do vitest: avança o tempo sem esperar.
function setup() {
  const seen: (ToastState | null)[] = [];
  const controller = createToastController<ReturnType<typeof setTimeout>>(
    { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
    (t) => seen.push(t),
  );
  const visible = () => controller.current?.title ?? null;
  return { controller, visible, seen };
}

describe("toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("some sozinho em 5 s, não antes", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Embarque registrado" });
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(visible()).toBe("Embarque registrado"); // 4,999 s: ainda na tela
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull(); // 5 s: sumiu
    expect(TOAST_MS).toBe(5000);
  });

  it("com VoiceOver ligado some em 8 s", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Embarque registrado", screenReader: true });
    vi.advanceTimersByTime(5000);
    expect(visible()).toBe("Embarque registrado"); // aos 5 s ainda está
    vi.advanceTimersByTime(TOAST_MS_SCREEN_READER - 5000 - 1);
    expect(visible()).toBe("Embarque registrado"); // 7,999 s
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull(); // 8 s
  });

  it("tocar na ação: o toast some na hora e a ação roda uma vez", () => {
    const { controller, visible } = setup();
    const run = vi.fn();
    controller.show({ title: "Embarque registrado", action: { label: "Desfazer", run } });
    vi.advanceTimersByTime(1200);
    controller.press();
    expect(visible()).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    // O toque seguinte (duplo toque) não roda a ação de novo, e o tempo restante não faz nada.
    controller.press();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a ação pode mostrar outro toast (Desfazer → 'Registro desfeito'), que fica na tela", () => {
    const { controller, visible } = setup();
    controller.show({
      title: "Embarque registrado",
      action: { label: "Desfazer", run: () => controller.show({ title: "Registro desfeito" }) },
    });
    controller.press();
    expect(visible()).toBe("Registro desfeito");
    vi.advanceTimersByTime(TOAST_MS);
    expect(visible()).toBeNull();
  });

  it("um toast por vez: o novo substitui o anterior e o tempo recomeça", () => {
    const { controller, visible } = setup();
    controller.show({ title: "primeiro" });
    vi.advanceTimersByTime(4000);
    controller.show({ title: "segundo" });
    expect(visible()).toBe("segundo");
    // O prazo do primeiro (5 s) vence 1 s depois, mas o segundo tem os seus 5 s inteiros.
    vi.advanceTimersByTime(1500);
    expect(visible()).toBe("segundo");
    vi.advanceTimersByTime(3500);
    expect(visible()).toBeNull();
  });

  it("o toast de erro não some sozinho; some ao tocar em 'Tentar de novo' ou ao ser substituído", () => {
    const { controller, visible } = setup();
    const retry = vi.fn();
    controller.show({ title: "Não foi possível gravar", kind: "error", action: { label: "Tentar de novo", run: retry } });
    vi.advanceTimersByTime(600_000);
    expect(visible()).toBe("Não foi possível gravar"); // 10 minutos depois, continua
    controller.press();
    expect(visible()).toBeNull();
    expect(retry).toHaveBeenCalledTimes(1);

    controller.show({ title: "erro", kind: "error" });
    controller.show({ title: "outro" });
    vi.advanceTimersByTime(TOAST_MS);
    expect(visible()).toBeNull();
  });

  it("cada toast tem um id novo, mesmo com o mesmo texto (a animação roda de novo)", () => {
    const { controller, seen } = setup();
    const a = controller.show({ title: "igual" });
    const b = controller.show({ title: "igual" });
    expect(b).toBeGreaterThan(a);
    expect(seen.filter(Boolean).map((t) => t!.id)).toEqual([a, b]);
  });
});
