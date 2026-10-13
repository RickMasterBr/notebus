import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOAST_MS_REFUSAL,
  TOAST_MS_REFUSAL_SCREEN_READER,
  createToastController,
  toastDuration,
} from "./toastController";

function setup() {
  const controller = createToastController<ReturnType<typeof setTimeout>>(
    { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
    () => {},
  );
  const visible = () => controller.current?.title ?? null;
  return { controller, visible };
}

describe("toast de recusa (E-08.5 bloco 4, E2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("kind: 'refusal', sem VoiceOver: aos 7.999 ms ainda visível e aos 8.000 ms some", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Já existe uma linha com este código.", kind: "refusal" });
    vi.advanceTimersByTime(7999);
    expect(visible()).toBe("Já existe uma linha com este código.");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
  });

  it("kind: 'refusal' com screenReader: true: aos 11.999 ms ainda visível e aos 12.000 ms some", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Já existe uma linha com este código.", kind: "refusal", screenReader: true });
    vi.advanceTimersByTime(11999);
    expect(visible()).toBe("Já existe uma linha com este código.");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
  });

  it("toastDuration({ kind: 'refusal' }) devolve 8000", () => {
    expect(toastDuration({ kind: "refusal" })).toBe(8000);
  });

  it("toastDuration({ kind: 'refusal', screenReader: true }) devolve 12000", () => {
    expect(toastDuration({ kind: "refusal", screenReader: true })).toBe(12000);
  });

  it("kind: 'error', 600.000 ms continua visível", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Não foi possível gravar", kind: "error" });
    vi.advanceTimersByTime(600_000);
    expect(visible()).toBe("Não foi possível gravar");
  });

  it("refusal e depois um toast novo: o novo substitui e o temporizador antigo não derruba o novo", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Recusa", kind: "refusal" });
    vi.advanceTimersByTime(7000);
    controller.show({ title: "Novo toast" });
    expect(visible()).toBe("Novo toast");
    vi.advanceTimersByTime(2000);
    expect(visible()).toBe("Novo toast");
    vi.advanceTimersByTime(3000);
    expect(visible()).toBeNull();
  });

  it("toastDuration({ kind: 'info' }) e toastDuration({ kind: 'info', action }) devolvem 5000 e 8000", () => {
    const action = { label: "Desfazer", run: () => {} };
    expect(toastDuration({ kind: "info" })).toBe(5000);
    expect(toastDuration({ kind: "info", action })).toBe(8000);
  });
});
