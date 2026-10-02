import { describe, expect, it } from "vitest";
import { colors } from "./tokens";

describe("tema", () => {
  it("claro e escuro têm exatamente as mesmas chaves", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });
});
