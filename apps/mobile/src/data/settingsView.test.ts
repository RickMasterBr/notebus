import { describe, expect, it } from "vitest";
import { lisbon } from "./registroFixture";
import {
  backupDaysText,
  dayTypeCounts,
  formatHolidayLine,
  formatOverrideLine,
  networkLine,
  splitOverrides,
  stepMargin,
  toLocalDateString,
} from "./settingsView";

describe("settingsView", () => {
  describe("backupDaysText (item 2.1)", () => {
    it("null -> você ainda não exportou um backup", () => {
      const res = backupDaysText(null, lisbon("2026-10-10", "12:00"));
      expect(res.key).toBe("settings.backup.never");
    });

    it("mesmo dia de Lisboa -> último backup hoje", () => {
      const exportAt = lisbon("2026-10-10", "08:00");
      const now = lisbon("2026-10-10", "20:00");
      const res = backupDaysText(exportAt, now);
      expect(res.key).toBe("settings.backup.today");
    });

    it("backup às 23:50 visto às 00:10 do dia seguinte de Lisboa -> ontem", () => {
      const exportAt = lisbon("2026-10-10", "23:50");
      const now = lisbon("2026-10-11", "00:10");
      const res = backupDaysText(exportAt, now);
      expect(res.key).toBe("settings.backup.yesterday");
    });

    it("backup há 3 dias -> há 3 dias", () => {
      const exportAt = lisbon("2026-10-07", "12:00");
      const now = lisbon("2026-10-10", "14:00");
      const res = backupDaysText(exportAt, now);
      expect(res.key).toBe("settings.backup.days_ago");
      expect(res.params).toEqual({ n: 3 });
    });
  });

  describe("stepMargin (item 2.2)", () => {
    it("incrementa e decrementa dentro de 0 a 10", () => {
      expect(stepMargin(2, 1)).toEqual({ value: 3, atMin: false, atMax: false });
      expect(stepMargin(2, -1)).toEqual({ value: 1, atMin: false, atMax: false });
    });

    it("fronteira em 0: limita a 0 e atMin é true", () => {
      expect(stepMargin(0, -1)).toEqual({ value: 0, atMin: true, atMax: false });
      expect(stepMargin(1, -1)).toEqual({ value: 0, atMin: true, atMax: false });
    });

    it("fronteira em 10: limita a 10 e atMax é true", () => {
      expect(stepMargin(10, 1)).toEqual({ value: 10, atMin: false, atMax: true });
      expect(stepMargin(9, 1)).toEqual({ value: 10, atMin: false, atMax: true });
    });
  });

  describe("splitOverrides (item 2.3)", () => {
    const rows = [
      { id: "1", date: "2026-10-10", note: "hoje" },
      { id: "2", date: "2026-10-12", note: "depois" },
      { id: "3", date: "2026-10-09", note: "ontem" },
      { id: "4", date: "2026-10-05", note: "passada antiga" },
      { id: "5", date: "2026-10-11", note: "amanha" },
    ];

    it("exceção de hoje fica nas futuras (crescente) e ontem vai para passadas (decrescente)", () => {
      const result = splitOverrides(rows, "2026-10-10");
      expect(result.upcoming.map((r) => r.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
      expect(result.past.map((r) => r.date)).toEqual(["2026-10-09", "2026-10-05"]);
      expect(result.pastCount).toBe(2);
    });
  });

  describe("dayTypeCounts (item 2.4)", () => {
    it("conta viagens por tipo de dia a partir de trips do snapshot", () => {
      const snapshot = {
        schedule: {
          trips: [
            { id: "t1", dayTypes: ["weekday"] },
            { id: "t2", dayTypes: ["weekday", "saturday"] },
            { id: "t3", dayTypes: ["sunday_holiday"] },
            { id: "t4", dayTypes: ["weekday"] },
          ],
        },
      } as any;

      expect(dayTypeCounts(snapshot)).toEqual({
        weekday: 3,
        saturday: 1,
        sunday_holiday: 1,
      });
    });

    it("snapshot vazio ou nulo devolve zeros", () => {
      expect(dayTypeCounts(null)).toEqual({ weekday: 0, saturday: 0, sunday_holiday: 0 });
    });
  });

  describe("networkLine (item 2.5)", () => {
    it("sem dataset devolve null", () => {
      expect(networkLine(null, { name: "MOBILIS" })).toBeNull();
      expect(networkLine(undefined)).toBeNull();
    });

    it("com dataset e vigência formata a linha completa", () => {
      const line = networkLine(
        { version: "2026-09-01", validFrom: "2026-09-01" },
        { name: "MOBILIS" },
      );
      expect(line).toBe("MOBILIS Leiria · dados de 2026-09-01 · vigência desde 01/09/2026");
    });

    it("sem validFrom mostra só a versão", () => {
      const line = networkLine({ version: "2026-09-01" });
      expect(line).toBe("MOBILIS Leiria · dados de 2026-09-01");
    });
  });

  describe("formatação de linhas (item 2.6)", () => {
    it("formatOverrideLine: 24/12/2026 quinta · Sábado", () => {
      expect(formatOverrideLine("2026-12-24", "saturday")).toBe("24/12/2026 quinta · Sábado");
    });

    it("formatHolidayLine: recorrente e não recorrente", () => {
      expect(formatHolidayLine("3 de março", "2027-03-03", true)).toBe("3 de março · 03/03 · todo ano");
      expect(formatHolidayLine("Ponte", "2027-04-10", false)).toBe("Ponte · 10/04/2027");
    });
  });

  describe("toLocalDateString (Item 4.2)", () => {
    it("converte data às 23:30 para o dia local correto", () => {
      // 23:30 no fuso local: ano, mês (0-based: 9 = outubro), dia 10
      const dateLate = new Date(2026, 9, 10, 23, 30, 0);
      expect(toLocalDateString(dateLate)).toBe("2026-10-10");
    });

    it("converte data às 00:30 para o dia local correto", () => {
      // 00:30 no fuso local: 11 de outubro
      const dateEarly = new Date(2026, 9, 11, 0, 30, 0);
      expect(toLocalDateString(dateEarly)).toBe("2026-10-11");
    });
  });
});

