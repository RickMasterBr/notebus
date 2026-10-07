import { describe, expect, it } from "vitest";
import { formatServiceMinute } from "@notebus/domain";
import { alarmLine, minuteText } from "./alarmsUi";

describe("E-06 Item 0: minuteText e horário sem fração", () => {
  it("mostra que o código antigo com formatServiceMinute exibe decimais fracionários", () => {
    const raw = formatServiceMinute(1232.6666666666667);
    expect(raw).toContain("20:32.66");
  });

  it("minuteText devolve o horário sem fração arredondando para baixo", () => {
    expect(minuteText(1232.6666666666667)).toBe("20:32");
    expect(minuteText(1180)).toBe("19:40");
    expect(minuteText(1500)).toBe("25:00");
  });

  it("alarmLine com leaveTime vindo de minuteText não contém ponto", () => {
    const line = alarmLine(
      { weekdays: [1], validTo: null },
      { placeName: "Facul", lineCode: "L1", leaveTime: minuteText(1232.6666666666667) },
    );
    expect(line).not.toContain(".");
  });
});
