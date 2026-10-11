import { describe, expect, it } from "vitest";
import { cardLabel } from "./cardLabel";

describe("cardLabel", () => {
  it("com apelidos junta o texto base e os apelidos depois de uma vírgula", () => {
    expect(cardLabel("Largo Um, 3 linhas", "Shopping, Praça")).toBe("Largo Um, 3 linhas, Shopping, Praça");
  });

  it.each([undefined, null, ""])("sem apelidos (%j) devolve só o texto base", (aliases) => {
    expect(cardLabel("Largo Um", aliases)).toBe("Largo Um");
  });
});
