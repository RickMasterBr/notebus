/// <reference types="node" />
/**
 * Testes da decisão pura de qual cartão de guia do Início aparece (T-136, D-196, D-202).
 * Valores escritos à mão com a regra no comentário.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { homeGuide } from "./homeGuide";

describe("data/homeGuide (T-136)", () => {
  // G1: rede do usuário, >= 1 ponto, nenhuma linha -> 'line', dismissible: false
  it("G1: sem dataset, com ponto e sem linha devolve line não dispensável", () => {
    const result = homeGuide({
      hasDataset: false,
      stopCount: 1,
      lineCount: 0,
      recordCount: 0,
      dismissed: false,
    });
    expect(result).toEqual({ kind: "line", dismissible: false });
  });

  // G2: rede do usuário, >= 1 linha, nenhum registro, não dispensado -> 'register', dismissible: true
  it("G2: sem dataset, com linha, sem registro e não dispensado devolve register dispensável", () => {
    const result = homeGuide({
      hasDataset: false,
      stopCount: 2,
      lineCount: 1,
      recordCount: 0,
      dismissed: false,
    });
    expect(result).toEqual({ kind: "register", dismissible: true });
  });

  // G3: MOBILIS importada, nenhum registro, não dispensado -> 'mobilis', dismissible: true
  it("G3: com dataset, sem registro e não dispensado devolve mobilis dispensável", () => {
    const result = homeGuide({
      hasDataset: true,
      stopCount: 10,
      lineCount: 5,
      recordCount: 0,
      dismissed: false,
    });
    expect(result).toEqual({ kind: "mobilis", dismissible: true });
  });

  it("dismissed com G2 e G3 devolve null", () => {
    // G2 dispensado -> null
    expect(
      homeGuide({
        hasDataset: false,
        stopCount: 2,
        lineCount: 1,
        recordCount: 0,
        dismissed: true,
      }),
    ).toBeNull();

    // G3 dispensado -> null
    expect(
      homeGuide({
        hasDataset: true,
        stopCount: 10,
        lineCount: 5,
        recordCount: 0,
        dismissed: true,
      }),
    ).toBeNull();
  });

  it("dismissed com G1 continua line (caminho obrigatório)", () => {
    expect(
      homeGuide({
        hasDataset: false,
        stopCount: 1,
        lineCount: 0,
        recordCount: 0,
        dismissed: true,
      }),
    ).toEqual({ kind: "line", dismissible: false });
  });

  it("recordCount >= 1 com G2 e G3 devolve null (aprendizado já começou)", () => {
    // G2 com registro -> null
    expect(
      homeGuide({
        hasDataset: false,
        stopCount: 2,
        lineCount: 1,
        recordCount: 1,
        dismissed: false,
      }),
    ).toBeNull();

    // G3 com registro -> null
    expect(
      homeGuide({
        hasDataset: true,
        stopCount: 10,
        lineCount: 5,
        recordCount: 2,
        dismissed: false,
      }),
    ).toBeNull();
  });

  it("sem dataset e sem ponto devolve null (vazio é do EmptyHome)", () => {
    expect(
      homeGuide({
        hasDataset: false,
        stopCount: 0,
        lineCount: 0,
        recordCount: 0,
        dismissed: false,
      }),
    ).toBeNull();
  });

  it("com dataset e lineCount === 0 devolve mobilis (regra fixa independente de linhas)", () => {
    expect(
      homeGuide({
        hasDataset: true,
        stopCount: 0,
        lineCount: 0,
        recordCount: 0,
        dismissed: false,
      }),
    ).toEqual({ kind: "mobilis", dismissible: true });
  });

  it("com dataset e lineCount >= 1 devolve mobilis e nunca register", () => {
    expect(
      homeGuide({
        hasDataset: true,
        stopCount: 1,
        lineCount: 1,
        recordCount: 0,
        dismissed: false,
      }),
    ).toEqual({ kind: "mobilis", dismissible: true });
  });

  it("ordem da tabela T-136: G2 precede G3 em homeGuide (trocar a ordem cai com hasDataset e lineCount >= 1)", () => {
    const src = readFileSync(join(__dirname, "homeGuide.ts"), "utf8");
    const fnBody = src.slice(src.indexOf("function homeGuide"));
    const g2Pos = fnBody.indexOf('"register"');
    const g3Pos = fnBody.indexOf('"mobilis"');
    expect(g2Pos, "G2 deve preceder G3 na função homeGuide").toBeLessThan(g3Pos);
  });
});
