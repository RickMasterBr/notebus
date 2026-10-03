import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { t } from "./index";
import { ptBR } from "./pt-BR";

describe("t()", () => {
  it("troca os placeholders", () => {
    expect(t("first_run.importing", { count: 9 })).toBe("Importando 9 linhas…");
    expect(t("first_run.import_mobilis.detail", { count: 9, date: "01/09/2026" })).toBe(
      "9 linhas com os horários oficiais de 01/09/2026. Tudo editável.",
    );
  });
  it("sem parâmetro devolve o texto como está; placeholder sem valor fica visível", () => {
    expect(t("home.empty.action")).toBe("Cadastrar meu ponto");
    expect(t("first_run.importing")).toBe("Importando {{count}} linhas…");
  });
  it("toda chave tem texto", () => {
    for (const [key, text] of Object.entries(ptBR)) expect(text.length, key).toBeGreaterThan(0);
  });
});

describe("textos usados nas telas", () => {
  it("toda chave passada a t() no código existe no catálogo", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(root);
    const used = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(match[1]!);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const key of used) expect(key in ptBR, `chave "${key}" não está em pt-BR.ts`).toBe(true);
  });

  it("as chaves da 4.6 usadas na folha inicial têm o texto da 4.6", () => {
    expect(t("home.search_placeholder")).toBe("Buscar ponto, linha ou lugar");
    expect(t("common.close")).toBe("Fechar");
  });

  it("os textos da folha e da busca são os da 4.6 §3.12", () => {
    expect(t("common.loading")).toBe("Carregando");
    expect(t("sheet.handle.a11y")).toBe("Tamanho da folha");
    expect([t("sheet.detent.small"), t("sheet.detent.medium"), t("sheet.detent.large")]).toEqual(["pequeno", "médio", "grande"]);
    expect(t("search.group.stops")).toBe("Pontos");
    expect(t("search.empty.no_results", { term: "xyz" })).toBe("Nada encontrado para “xyz”");
    expect(t("search.clear.a11y")).toBe("Limpar busca");
    expect(t("search.result.stop.a11y", { name: "Praça Inventada", lines: "1, 3" })).toBe("Praça Inventada, linhas 1, 3");
  });
});
