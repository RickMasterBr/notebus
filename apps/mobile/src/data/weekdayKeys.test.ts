import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";
import {
  weekdayFullKey,
  weekdayPluralKey,
  weekdayShortKey,
} from "./alarmsUi";

describe("E-06 Item 1: Funções de chaves de dia da semana no catálogo", () => {
  it("weekdayPluralKey devolve chave existente no catálogo para os 7 dias (0 a 6)", () => {
    for (let d = 0; d < 7; d++) {
      const key = weekdayPluralKey(d);
      expect(key in ptBR, `chave plural ${key} deve existir no catálogo`).toBe(true);
      expect(ptBR[key]).toBeTruthy();
    }
  });

  it("weekdayShortKey devolve chave existente no catálogo para os 7 dias (0 a 6)", () => {
    for (let d = 0; d < 7; d++) {
      const key = weekdayShortKey(d);
      expect(key in ptBR, `chave curta ${key} deve existir no catálogo`).toBe(true);
      expect(ptBR[key]).toBeTruthy();
    }
  });

  it("weekdayFullKey devolve chave existente no catálogo para os 7 dias (0 a 6)", () => {
    for (let d = 0; d < 7; d++) {
      const key = weekdayFullKey(d);
      expect(key in ptBR, `chave completa ${key} deve existir no catálogo`).toBe(true);
      expect(ptBR[key]).toBeTruthy();
    }
  });

  it("lança erro para dia inválido fora de 0..6", () => {
    expect(() => weekdayPluralKey(7)).toThrow(/dia da semana inválido/);
    expect(() => weekdayPluralKey(-1)).toThrow(/dia da semana inválido/);
    expect(() => weekdayShortKey(7)).toThrow(/dia da semana inválido/);
    expect(() => weekdayFullKey(7)).toThrow(/dia da semana inválido/);
  });
});
