/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { aboutView, licenseRows } from "./about";

const input = { appVersion: "0.4.0 (abc1234)", schemaVersion: 7, datasets: [{ name: "MOBILIS Teste", version: "2026-09-01" }] };

describe("aboutView", () => {
  it("devolve cada campo da página sem repoUrl", () => {
    expect(aboutView(input)).toEqual({
      appVersion: "0.4.0 (abc1234)",
      schemaVersion: "7",
      dataVersion: "MOBILIS Teste 2026-09-01",
      creditHolidays: "Feriados: date-holidays (CC BY-SA 3.0)",
      creditMap: "Mapa: OpenFreeMap © OpenMapTiles, dados de © OpenStreetMap contributors",
      noticeLines: [
        "O NoteBus não é um app da MOBILIS.",
        "Os horários vêm de um arquivo importado e podem estar errados ou mudar.",
        "A logo e o ícone são provisórios e vão mudar.",
      ],
    });
    expect(aboutView(input)).not.toHaveProperty("repoUrl");
  });

  it("nenhum arquivo de apps/mobile/src contém github.com/RickMasterBr", () => {
    const srcDir = join(__dirname, "..");
    function findAllFiles(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return findAllFiles(full);
        return [full];
      });
    }
    const banned = ["github.com", "RickMasterBr"].join("/");
    const files = findAllFiles(srcDir).filter((f) => !f.endsWith("about.test.ts"));
    const violations = files
      .map((f) => relative(srcDir, f).replace(/\\/g, "/"))
      .filter((relPath) => readFileSync(join(srcDir, relPath), "utf8").includes(banned));
    expect(violations).toEqual([]);
  });

  it("antes da leitura do banco mostra traço; sem horários instalados avisa", () => {
    const loading = aboutView({ ...input, schemaVersion: null, datasets: null });
    expect(loading.schemaVersion).toBe("–");
    expect(loading.dataVersion).toBe("–");
    expect(aboutView({ ...input, datasets: [] }).dataVersion).toBe("Nenhum horário instalado");
  });

  it("várias versões de dados vêm separadas por vírgula, na ordem dada", () => {
    const two = aboutView({ ...input, datasets: [{ name: "A", version: "1" }, { name: "B", version: "2" }] });
    expect(two.dataVersion).toBe("A 1, B 2");
  });

  it("o aviso diz que não é da MOBILIS, que os horários podem errar e que a logo é provisória, nesta ordem", () => {
    const [notMobilis, times, brand] = aboutView(input).noticeLines;
    expect(notMobilis).toContain("não é um app da MOBILIS");
    expect(times).toContain("podem estar errados");
    expect(brand).toContain("provisórios");
  });
});

describe("licenseRows", () => {
  it("uma linha por pacote, com chave única e a licença embaixo, na ordem recebida", () => {
    const rows = licenseRows([
      { name: "a", version: "1.0.0", license: "MIT" },
      { name: "a", version: "2.0.0", license: "ISC" },
    ]);
    expect(rows).toEqual([
      { key: "a@1.0.0", title: "a 1.0.0", detail: "MIT" },
      { key: "a@2.0.0", title: "a 2.0.0", detail: "ISC" },
    ]);
  });
});
