import { describe, expect, it } from "vitest";
import {
  normalizeUserName,
  settingsHandle,
  settingsIndexView,
  settingsNavReduce,
  settingsPageTitle,
  type SettingsPage,
} from "./settingsIndex";

describe("settingsIndex (Item 1, D-206, D-207)", () => {
  describe("normalizeUserName", () => {
    it("espaços vazios viram null", () => {
      expect(normalizeUserName("  ")).toBeNull();
      expect(normalizeUserName("")).toBeNull();
      expect(normalizeUserName(null)).toBeNull();
    });

    it("espaços múltiplos viram um espaço só e apara as pontas", () => {
      expect(normalizeUserName("  Rick   Lopes ")).toBe("Rick Lopes");
    });

    it("corta no máximo em 24 caracteres e apara as pontas", () => {
      // 30 caracteres
      const raw30 = "abcdefghijklmnopqrstuvwxyz1234";
      const normalized = normalizeUserName(raw30);
      expect(normalized).toBe("abcdefghijklmnopqrstuvwx");
      expect(normalized?.length).toBe(24);
      // corte com espaço na 24ª posição
      expect(normalizeUserName("12345678901234567890123   extra")).toBe("12345678901234567890123");
    });
  });

  describe("settingsNavReduce", () => {
    it("abrir página muda para a página", () => {
      expect(settingsNavReduce("root", { type: "open", page: "name" })).toBe("name");
      expect(settingsNavReduce("root", { type: "open", page: "margin" })).toBe("margin");
    });

    it("voltar de uma página vai para a raiz", () => {
      expect(settingsNavReduce("name", { type: "back" })).toBe("root");
      expect(settingsNavReduce("margin", { type: "back" })).toBe("root");
    });

    it("voltar na raiz continua na raiz", () => {
      expect(settingsNavReduce("root", { type: "back" })).toBe("root");
    });
  });

  describe("settingsHandle", () => {
    it("na raiz mostra fechar e chama close", () => {
      expect(settingsHandle("root")).toEqual({ showClose: true, press: "close" });
    });

    it("numa página não mostra fechar e chama back", () => {
      const pages: SettingsPage[] = ["name", "margin", "days", "holidays", "map", "backup", "about"];
      for (const p of pages) {
        expect(settingsHandle(p)).toEqual({ showClose: false, press: "back" });
      }
    });
  });

  describe("settingsPageTitle", () => {
    it("devolve a chave de título para cada página", () => {
      expect(settingsPageTitle("root")).toBe("settings.title");
      expect(settingsPageTitle("name")).toBe("settings.name.title");
      expect(settingsPageTitle("margin")).toBe("settings.margin.title");
      expect(settingsPageTitle("days")).toBe("settings.days.row");
      expect(settingsPageTitle("holidays")).toBe("settings.holidays.row");
      expect(settingsPageTitle("map")).toBe("settings.offline_map.title");
      expect(settingsPageTitle("backup")).toBe("settings.data.backup_row");
      expect(settingsPageTitle("about")).toBe("settings.about.title");
    });
  });

  describe("settingsIndexView", () => {
    const baseInput = {
      userName: "Richard",
      placeNames: ["Casa", "Facul", "Academia"],
      margin: 3,
      todayDayType: "weekday" as const,
      upcomingOverrides: 0,
      includeMunicipal: true,
      alarmsAllowed: true,
      activeAlarms: 2,
      networkName: "MOBILIS Leiria",
      offlineDetail: "Pronto · 38 MB",
      backupText: "Último backup há 3 dias",
    };

    it("nameValue: nome preenchido ou Opcional sem nome", () => {
      expect(settingsIndexView({ ...baseInput, userName: "Richard" }).nameValue).toBe("Richard");
      expect(settingsIndexView({ ...baseInput, userName: null }).nameValue).toBe("Opcional");
      expect(settingsIndexView({ ...baseInput, userName: "" }).nameValue).toBe("Opcional");
      expect(settingsIndexView({ ...baseInput, userName: "   " }).nameValue).toBe("Opcional");
    });

    it("placesValue nas fronteiras: 0, 1, 3 e 4 lugares", () => {
      // 0 lugares
      expect(settingsIndexView({ ...baseInput, placeNames: [] }).placesValue).toBe("Nenhum lugar ainda");
      // 1 lugar
      expect(settingsIndexView({ ...baseInput, placeNames: ["Casa"] }).placesValue).toBe("Casa");
      // 3 lugares
      expect(settingsIndexView({ ...baseInput, placeNames: ["Casa", "Facul", "Academia"] }).placesValue).toBe(
        "Casa, Facul, Academia",
      );
      // 4 lugares: 3 primeiros e mais 1
      expect(
        settingsIndexView({ ...baseInput, placeNames: ["Casa", "Facul", "Academia", "Trabalho"] }).placesValue,
      ).toBe("Casa, Facul, Academia e mais 1");
      // 5 lugares: 3 primeiros e mais 2
      expect(
        settingsIndexView({ ...baseInput, placeNames: ["Casa", "Facul", "Academia", "Trabalho", "Praia"] }).placesValue,
      ).toBe("Casa, Facul, Academia e mais 2");
    });

    it("marginValue: formata com o número de minutos", () => {
      expect(settingsIndexView({ ...baseInput, margin: 3 }).marginValue).toBe("3 min");
      expect(settingsIndexView({ ...baseInput, margin: 0 }).marginValue).toBe("0 min");
    });

    it("daysValue: fronteiras de exceções (0, 1, 2) e todayDayType nulo", () => {
      // dia útil com 0 exceções
      expect(settingsIndexView({ ...baseInput, todayDayType: "weekday", upcomingOverrides: 0 }).daysValue).toBe(
        "Hoje é dia útil · sem exceções",
      );
      // sábado com 1 exceção
      expect(settingsIndexView({ ...baseInput, todayDayType: "saturday", upcomingOverrides: 1 }).daysValue).toBe(
        "Hoje é sábado · 1 exceção",
      );
      // domingo/feriado com 2 exceções
      expect(settingsIndexView({ ...baseInput, todayDayType: "sunday_holiday", upcomingOverrides: 2 }).daysValue).toBe(
        "Hoje é domingo ou feriado · 2 exceções",
      );
      // todayDayType null com 1 exceção
      expect(settingsIndexView({ ...baseInput, todayDayType: null, upcomingOverrides: 1 }).daysValue).toBe(
        "1 exceção",
      );
      // todayDayType null com 0 exceções
      expect(settingsIndexView({ ...baseInput, todayDayType: null, upcomingOverrides: 0 }).daysValue).toBe(
        "sem exceções",
      );
    });

    it("holidaysValue: dois ramos (municipal ligado vs nacional)", () => {
      expect(settingsIndexView({ ...baseInput, includeMunicipal: true }).holidaysValue).toBe(
        "Nacionais e de Leiria",
      );
      expect(settingsIndexView({ ...baseInput, includeMunicipal: false }).holidaysValue).toBe(
        "Só os nacionais",
      );
    });

    it("alertsHint e alertsCount", () => {
      expect(settingsIndexView({ ...baseInput, alarmsAllowed: true }).alertsHint).toBe(
        "Tocam no horário que o app aprendeu",
      );
      expect(settingsIndexView({ ...baseInput, alarmsAllowed: false }).alertsHint).toBe(
        "Desligado: nenhum aviso toca. Os avisos continuam guardados.",
      );
      expect(settingsIndexView({ ...baseInput, activeAlarms: 2 }).alertsCount).toBe("2");
    });

    it("networkName, mapValue e backupValue passam direto; networkName nulo vira null", () => {
      const view = settingsIndexView({
        ...baseInput,
        networkName: "MOBILIS Leiria",
        offlineDetail: "Pronto · 38 MB",
        backupText: "Último backup há 3 dias",
      });
      expect(view.networkName).toBe("MOBILIS Leiria");
      expect(view.mapValue).toBe("Pronto · 38 MB");
      expect(view.backupValue).toBe("Último backup há 3 dias");

      expect(settingsIndexView({ ...baseInput, networkName: null }).networkName).toBeNull();
    });
  });
});
