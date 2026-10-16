import { describe, expect, it, vi } from "vitest";

vi.mock("./diagScroll", () => ({ DIAG_SCROLL: false, recordDiagEvent: vi.fn() }));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", Text: "Text", View: "View" }));

describe("installDiagGlobalHandler (DIAG_SCROLL desligado)", () => {
  it("nao troca nada", async () => {
    const original = vi.fn();
    const setGlobalHandler = vi.fn();
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = { getGlobalHandler: () => original, setGlobalHandler };
    const { installDiagGlobalHandler } = await import("./DiagErrorBoundary");

    installDiagGlobalHandler();

    expect(setGlobalHandler).not.toHaveBeenCalled();
  });
});
