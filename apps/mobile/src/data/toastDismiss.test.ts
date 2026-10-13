import { describe, expect, it } from "vitest";
import { toastShowsClose } from "./toastDismiss";

describe("toastShowsClose (E-08.5 bloco 4, Item 2)", () => {
  it("devolve true apenas para kind 'error'", () => {
    expect(toastShowsClose({ kind: "error" })).toBe(true);
  });

  it("devolve false para kind 'info'", () => {
    expect(toastShowsClose({ kind: "info" })).toBe(false);
  });

  it("devolve false para kind 'refusal'", () => {
    expect(toastShowsClose({ kind: "refusal" })).toBe(false);
  });

  it("devolve false quando kind é ausente (conta como 'info')", () => {
    expect(toastShowsClose({})).toBe(false);
  });
});
