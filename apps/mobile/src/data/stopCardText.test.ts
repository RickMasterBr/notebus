import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import type { StopCard } from "./stopCard";
import { busEtaText, cardA11y, directionText, lineA11y, monthsText, nextDayText, reasonText } from "./stopCardText";

const next = {
  status: "next",
  time: "08:10",
  rangeStart: "08:08",
  rangeEnd: "08:12",
  beAtStop: "08:06",
  confidence: "estimated",
} as const;

describe("textos do cartão de ponto (4.6)", () => {
  it("o que se vê", () => {
    expect(busEtaText(next)).toBe("ônibus ~08:10 · 08:08–08:12");
    expect(directionText("Estação")).toBe("→ Estação");
    expect(t("home.stop_card.eta_label")).toBe("no ponto às");
    expect(t("home.section.nearby")).toBe("Perto de você");
    expect(t("common.confidence.estimated")).toBe("estimado");
  });

  it("motivos de dia sem serviço (4.6 §3.10)", () => {
    expect(reasonText({ kind: "sunday_holiday" })).toBe("Não circula aos domingos e feriados");
    expect(reasonText({ kind: "weekdays_only" })).toBe("Só circula em dias úteis");
    expect(reasonText({ kind: "season", months: [7, 8] })).toBe("não circula em julho e agosto");
    expect(monthsText([6, 7, 8])).toBe("junho, julho e agosto");
    expect(monthsText([12])).toBe("dezembro");
    expect(nextDayText({ status: "later", reason: null, date: "2026-09-04", weekday: 5, time: "08:10" })).toBe("próximo: sexta, 08:10");
  });

  it("VoiceOver lê o cartão como um bloco: ponto, linha, próximo, esteja no ponto", () => {
    const line = { code: "1", color: "#7A3FF2", destination: "Estação", state: next };
    expect(lineA11y(line)).toBe("Linha 1, para Estação, próximo às 08:10, esteja no ponto às 08:06, estimado");
    const card: StopCard = {
      stopId: "a",
      name: "Arrabalde da Ponte",
      lines: [
        line,
        { code: "9", color: "#1C1C1E", destination: null, state: { status: "later", reason: { kind: "weekdays_only" }, date: "2026-09-07", weekday: 1, time: "07:30" } },
      ],
    };
    expect(cardA11y(card)).toBe(
      "Arrabalde da Ponte. Linha 1, para Estação, próximo às 08:10, esteja no ponto às 08:06, estimado. " +
        "Linha 9, Só circula em dias úteis, próximo: segunda, 07:30",
    );
  });
});
