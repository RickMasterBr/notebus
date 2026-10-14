import { DOMAIN_CONFIG, type DeviationEstimate } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import { confidenceNext } from "./confidenceNext";

// "Como a confiança sobe" (T-138, D-120, ux/4.8 §7.5). Calibração padrão: média com 3 registros, alta com 6 recentes
// (56 dias) e faixa até 4 min. Cada texto esperado tem a conta ao lado.

type Est = Pick<DeviationEstimate, "confidence" | "count" | "recentCount" | "rangeStart" | "rangeEnd">;
const est = (confidence: Est["confidence"], count: number, recentCount: number, rangeStart = 0, rangeEnd = 2): Est => ({
  confidence, count, recentCount, rangeStart, rangeEnd,
});
const text = (e: Est, config = DOMAIN_CONFIG) => {
  const { key, params } = confidenceNext(e, config);
  return t(key, params);
};
const OTHER = { ...DOMAIN_CONFIG, mediumFromRecords: 4, highFromRecords: 8, recentWindowDays: 30, highMaxRangeMinutes: 5 };

describe("confidenceNext (T-138)", () => {
  it("uma linha por situação, com o texto final", () => {
    expect(text(est("estimated", 0, 0))).toBe("Com 3 anotações, a confiança sobe para média."); // n = M = 3
    expect(text(est("low", 1, 1))).toBe("Com mais 2, a confiança sobe para média."); // 3 − 1 = 2
    expect(text(est("low", 2, 2))).toBe("Com mais uma, a confiança sobe para média."); // 3 − 2 = 1
    expect(text(est("medium", 4, 3))).toBe("Com 3 a mais nos últimos 56 dias, a confiança sobe para alta."); // 6 − 3 = 3
    expect(text(est("medium", 6, 5))).toBe("Com mais uma nos últimos 56 dias, a confiança sobe para alta."); // 6 − 5 = 1
    expect(text(est("medium", 6, 6))).toBe("Sobe para alta quando a faixa ficar em até 4 min."); // 6 recentes, faixa larga
    expect(text(est("high", 7, 7, 1, 4))).toBe("Confiança alta: 7 anotações recentes e faixa de 3 min."); // 4 − 1 = 3
  });

  it("T-138: mudar o config muda os números do texto", () => {
    expect(text(est("estimated", 0, 0), OTHER)).toBe("Com 4 anotações, a confiança sobe para média."); // M = 4
    expect(text(est("low", 1, 1), OTHER)).toBe("Com mais 3, a confiança sobe para média."); // 4 − 1 = 3
    expect(text(est("medium", 6, 5), OTHER)).toBe("Com 3 a mais nos últimos 30 dias, a confiança sobe para alta."); // 8 − 5 = 3; D = 30
    expect(text(est("medium", 9, 8), OTHER)).toBe("Sobe para alta quando a faixa ficar em até 5 min."); // 8 ≥ H = 8; R = 5
  });

  it("fronteiras", () => {
    expect(confidenceNext(est("medium", 6, 5)).key).toBe("why.next.to_high_one"); // H − 1
    expect(confidenceNext(est("medium", 6, 6)).key).toBe("why.next.to_high_range"); // H
    expect(confidenceNext(est("high", 7, 7, 0, 3.6)).params.width).toBe(4); // round(3,6) = 4
  });

  it("nenhuma saída deixa {{ }} sem preencher", () => {
    const all = [
      est("estimated", 0, 0), est("low", 1, 1), est("low", 2, 2), est("medium", 4, 3),
      est("medium", 6, 5), est("medium", 6, 6), est("high", 7, 7, 1, 4),
    ];
    for (const e of all) for (const c of [DOMAIN_CONFIG, OTHER]) expect(text(e, c)).not.toContain("{{");
  });
});
