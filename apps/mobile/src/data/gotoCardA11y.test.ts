import { describe, expect, it } from "vitest";
import { gotoCardA11yKey } from "./gotoCardA11y";
import { t } from "../i18n";

// Ideia 221: o VoiceOver lê "Sair agora" onde o cartão diz "sair agora" (contrato 07c).

describe("gotoCardA11yKey: chave do rótulo do cartão de ônibus", () => {
  it("com o horário de saída já passado devolve a chave bus_card_now", () => {
    expect(gotoCardA11yKey(true)).toBe("sheet_goto.a11y.bus_card_now");
  });

  it("com o horário de saída por vir devolve a chave bus_card", () => {
    expect(gotoCardA11yKey(false)).toBe("sheet_goto.a11y.bus_card");
  });
});

describe("sheet_goto.a11y.bus_card_now: texto do rótulo", () => {
  it("começa por Sair agora, leva as horas certas e não deixa placeholder por substituir", () => {
    const label = t("sheet_goto.a11y.bus_card_now", {
      be_at: "17:56",
      arrive: "18:20",
      until: "18:40",
      line: "1",
      stop: "Arrabalde",
    });
    expect(label.startsWith("Sair agora")).toBe(true);
    expect(label).toContain("17:56");
    expect(label).toContain("Arrabalde");
    expect(label).not.toContain("{{");
  });

  it("o rótulo antigo continua a começar pelo horário de saída", () => {
    const label = t("sheet_goto.a11y.bus_card", {
      leave: "17:50",
      be_at: "17:56",
      arrive: "18:20",
      until: "18:40",
      line: "1",
      stop: "Arrabalde",
    });
    expect(label.startsWith("Sair às 17:50")).toBe(true);
  });
});
