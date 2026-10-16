import { beforeEach, describe, expect, it, vi } from "vitest";

const recordDiagEvent = vi.hoisted(() => vi.fn());

vi.mock("./diagScroll", () => ({ DIAG_SCROLL: true, recordDiagEvent }));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", Text: "Text", View: "View" }));

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils(original: Handler) {
  let current = original;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: vi.fn((handler: Handler) => {
      current = handler;
    }),
    current: () => current,
  };
}

describe("installDiagGlobalHandler (comportamento, DIAG_SCROLL ligado)", () => {
  beforeEach(() => {
    vi.resetModules();
    recordDiagEvent.mockClear();
  });

  it("troca o manipulador, registra ERRO e nao chama o original", async () => {
    const original = vi.fn();
    const utils = fakeErrorUtils(original);
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = utils;
    const { installDiagGlobalHandler } = await import("./DiagErrorBoundary");

    installDiagGlobalHandler();

    expect(utils.current()).not.toBe(original);
    utils.current()(new Error("x"), true);
    expect(recordDiagEvent).toHaveBeenCalledWith("ERRO x");
    expect(original).not.toHaveBeenCalled();
  });

  it("instalar duas vezes nao empilha", async () => {
    const original = vi.fn();
    const utils = fakeErrorUtils(original);
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = utils;
    const { installDiagGlobalHandler } = await import("./DiagErrorBoundary");

    installDiagGlobalHandler();
    const first = utils.current();
    installDiagGlobalHandler();

    expect(utils.setGlobalHandler).toHaveBeenCalledTimes(1);
    expect(utils.current()).toBe(first);
  });
});
