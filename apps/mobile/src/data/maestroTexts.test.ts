/**
 * E-09 bloco 26: todo `text:` dos fluxos `.maestro/*.yaml` existe no catálogo `pt-BR.ts` (ou é nome do seed inventado).
 * Texto sem metacaracteres de regex tem de ser IGUAL a um valor do catálogo; texto com regex (`.*...`) tem de casar,
 * inteiro (como o Maestro faz), com algum valor do catálogo depois de trocar cada `{{nome}}` por uma amostra.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const maestroDir = new URL("../../../../.maestro/", import.meta.url);
const catalog = readFileSync(new URL("../i18n/pt-BR.ts", import.meta.url), "utf8");

/** Nomes do seed de teste (rede mínima inventada, `testSeed`): não vêm do catálogo. */
const SEED_TEXTS = ["Arrabalde", "Facul", "Casa", "Linha 1"];
/** Amostras para os `{{nome}}` do catálogo. */
const SAMPLES = ["Facul", "Arrabalde", "Casa", "Linha 1", "10:00"];

const catalogValues = [...catalog.matchAll(/^\s*"[\w.]+":\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => m[1].replace(/\\"/g, '"'));
const candidates = [
  ...SEED_TEXTS,
  ...catalogValues.flatMap((value) =>
    value.includes("{{") ? SAMPLES.map((sample) => value.replace(/\{\{\w+\}\}/g, sample)) : [value],
  ),
];

const isRegex = (value: string) => /[.*+?^${}()|[\]\\]/.test(value);

const flows = readdirSync(maestroDir).filter((name) => name.endsWith(".yaml"));
const texts = flows.flatMap((flow) => {
  const yaml = readFileSync(new URL(flow, maestroDir), "utf8").replace(/\r\n/g, "\n");
  return [...yaml.matchAll(/^\s*(?:-\s*)?text:\s*"(.*)"\s*$/gm)].map((m) => ({ flow, value: m[1] }));
});

describe("E-09 bloco 26: textos dos fluxos Maestro", () => {
  it("há fluxos e textos para conferir", () => {
    expect(flows.length).toBeGreaterThanOrEqual(4);
    expect(texts.length).toBeGreaterThan(10);
  });
  it.each(texts.map((t) => [`${t.flow}: ${t.value}`, t.value] as const))("%s", (_nome, value) => {
    if (isRegex(value)) {
      const re = new RegExp(`^(?:${value})$`);
      expect(candidates.some((c) => re.test(c)), `nenhum texto do catálogo casa com /${value}/`).toBe(true);
    } else {
      expect(candidates, `"${value}" não existe no catálogo nem no seed`).toContain(value);
    }
  });
  it("nenhuma asserção aceita qualquer texto com 'às' (`.*às.*` solto)", () => {
    expect(texts.filter((t) => t.value.split("|").some((alt) => alt === ".*às.*"))).toEqual([]);
  });
});
