import { describe, expect, it } from "vitest";
import { adjustableStep } from "./marginStepper";

describe("adjustableStep (ações do VoiceOver no ajuste da margem)", () => {
  it("increment soma, decrement subtrai, outra ação não faz nada", () => {
    expect(adjustableStep("increment")).toBe(1);
    expect(adjustableStep("decrement")).toBe(-1);
    expect(adjustableStep("activate")).toBeNull();
    expect(adjustableStep("")).toBeNull();
  });
});
