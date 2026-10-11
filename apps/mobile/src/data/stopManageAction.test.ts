import { describe, expect, it } from "vitest";
import { isDeleteAction } from "./stopManage";

describe("isDeleteAction", () => {
  it("reconhece a ação delete do VoiceOver", () => {
    expect(isDeleteAction("delete")).toBe(true);
  });

  it("recusa qualquer outra ação ou texto vazio", () => {
    expect(isDeleteAction("xdelete")).toBe(false);
    expect(isDeleteAction("")).toBe(false);
    expect(isDeleteAction("activate")).toBe(false);
    expect(isDeleteAction("escape")).toBe(false);
    expect(isDeleteAction("deleteStop")).toBe(false);
  });
});
