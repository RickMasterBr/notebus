import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOAST_MS,
  TOAST_MS_ACTION,
  TOAST_MS_ACTION_SCREEN_READER,
  TOAST_MS_SCREEN_READER,
  createToastController,
  toastDuration,
} from "./toastController";

function setup() {
  const controller = createToastController<ReturnType<typeof setTimeout>>(
    { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
    () => {},
  );
  return { controller, visible: () => controller.current?.title ?? null };
}
const action = { label: "Desfazer", run: () => {} };

describe("toast com ação (D11: o Desfazer fica 8 s)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("as constantes", () => {
    expect([TOAST_MS, TOAST_MS_SCREEN_READER, TOAST_MS_ACTION, TOAST_MS_ACTION_SCREEN_READER]).toEqual([5000, 8000, 8000, 12000]);
  });

  it("com ação: aos 7999 ms ainda aparece e aos 8000 ms some", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Salvo", action });
    vi.advanceTimersByTime(7999);
    expect(visible()).toBe("Salvo");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
  });

  it("com ação e VoiceOver: aos 11999 ms ainda aparece e aos 12000 ms some", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Salvo", action, screenReader: true });
    vi.advanceTimersByTime(11999);
    expect(visible()).toBe("Salvo");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
  });

  it("sem ação continua em 5 s (8 s com VoiceOver)", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Oi" });
    vi.advanceTimersByTime(4999);
    expect(visible()).toBe("Oi");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
    controller.show({ title: "Oi", screenReader: true });
    vi.advanceTimersByTime(7999);
    expect(visible()).toBe("Oi");
    vi.advanceTimersByTime(1);
    expect(visible()).toBeNull();
  });

  it("só a ação secundária não conta como ação (continua em 5 s)", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Oi", secondaryAction: action });
    vi.advanceTimersByTime(5000);
    expect(visible()).toBeNull();
  });

  it("o toast de erro continua não sumindo sozinho, com ou sem ação", () => {
    const { controller, visible } = setup();
    controller.show({ title: "Erro", kind: "error", action });
    vi.advanceTimersByTime(60_000);
    expect(visible()).toBe("Erro");
  });

  it("toastDuration devolve os quatro tempos", () => {
    expect(toastDuration({})).toBe(5000);
    expect(toastDuration({ screenReader: true })).toBe(8000);
    expect(toastDuration({ action })).toBe(8000);
    expect(toastDuration({ action, screenReader: true })).toBe(12000);
  });
});
