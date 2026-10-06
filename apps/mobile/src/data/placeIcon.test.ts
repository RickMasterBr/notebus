import { describe, expect, it } from "vitest";
import { defaultPlaceIcon, resolveNewPlaceIconOnNameChange } from "./placeIcon";

describe("placeIcon (E-05 fechamento, item 2)", () => {
  describe("defaultPlaceIcon", () => {
    it("lugar nasce com 'casa' só quando o nome é 'Casa' (case-insensitive com trim)", () => {
      expect(defaultPlaceIcon("Casa")).toBe("casa");
      expect(defaultPlaceIcon("casa")).toBe("casa");
      expect(defaultPlaceIcon("CASA")).toBe("casa");
      expect(defaultPlaceIcon("  Casa  ")).toBe("casa");
    });

    it("lugar nasce com o ícone genérico (null) para qualquer outro nome", () => {
      expect(defaultPlaceIcon("Facul")).toBeNull();
      expect(defaultPlaceIcon("Academia")).toBeNull();
      expect(defaultPlaceIcon("Trabalho")).toBeNull();
      expect(defaultPlaceIcon("Casa da Praia")).toBeNull();
      expect(defaultPlaceIcon("")).toBeNull();
      expect(defaultPlaceIcon("   ")).toBeNull();
    });
  });

  describe("resolveNewPlaceIconOnNameChange", () => {
    it("se o usuário ainda não escolheu um ícone, o ícone acompanha o nome", () => {
      // Começou sem nome -> null
      let currentIcon: string | null = defaultPlaceIcon("");
      expect(currentIcon).toBeNull();

      // Digitou "Casa" -> vira "casa"
      currentIcon = resolveNewPlaceIconOnNameChange("Casa", currentIcon, false);
      expect(currentIcon).toBe("casa");

      // Mudou para "Facul" -> volta a ser null (genérico)
      currentIcon = resolveNewPlaceIconOnNameChange("Facul", currentIcon, false);
      expect(currentIcon).toBeNull();

      // Mudou de volta para " casa " -> vira "casa"
      currentIcon = resolveNewPlaceIconOnNameChange(" casa ", currentIcon, false);
      expect(currentIcon).toBe("casa");
    });

    it("se o usuário já escolheu um ícone, nada o troca ao mudar o nome", () => {
      // Usuário escolheu explicitamente "star"
      const chosenIcon = "star";
      const userPickedIcon = true;

      // Digita "Casa" -> mantém "star"
      expect(resolveNewPlaceIconOnNameChange("Casa", chosenIcon, userPickedIcon)).toBe("star");
      expect(resolveNewPlaceIconOnNameChange("Facul", chosenIcon, userPickedIcon)).toBe("star");
    });

    it("se o usuário escolheu explicitamente o ícone genérico (null), digitar 'Casa' não o troca", () => {
      const chosenIcon = null;
      const userPickedIcon = true;

      expect(resolveNewPlaceIconOnNameChange("Casa", chosenIcon, userPickedIcon)).toBeNull();
    });
  });
});
