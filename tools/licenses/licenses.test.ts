/**
 * Guarda das licenças (T-90, plano E-09 §3.7): a lista gerada está em dia com o `package-lock.json`, toda dependência de
 * produção tem licença na lista permitida (`allowed.json`) ou está em `NEEDS_REVIEW` esperando o Rick, e nenhuma está vazia.
 * Rodar: `npx vitest run --root tools/licenses` (a pasta ainda não é um pacote do workspace).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error script .mjs sem tipos
import { OUTPUT, TO_CHECK, buildLicenses, serialize } from "./generate.mjs";

interface Entry {
  name: string;
  version: string;
  license: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const allowedFile = JSON.parse(readFileSync(join(here, "allowed.json"), "utf8")) as {
  allowed: string[];
  onlyFor: Record<string, string[]>;
};
const generatedText = readFileSync(OUTPUT as string, "utf8");
const generated = (JSON.parse(generatedText) as { packages: Entry[] }).packages;

/** Licenças fora da lista permitida, à espera da decisão do Rick (nome@versão: licença). Não decida por ele. */
const NEEDS_REVIEW = new Set<string>([
  "caniuse-lite@1.0.30001814: CC-BY-4.0",
  "date-holidays@3.37.0: (ISC AND CC-BY-3.0)",
  ...[
    "android-arm64",
    "darwin-arm64",
    "darwin-x64",
    "freebsd-x64",
    "linux-arm-gnueabihf",
    "linux-arm64-gnu",
    "linux-arm64-musl",
    "linux-x64-gnu",
    "linux-x64-musl",
    "win32-arm64-msvc",
    "win32-x64-msvc",
  ].map((suffix) => `lightningcss-${suffix}@1.33.0: MPL-2.0`),
  "lightningcss@1.33.0: MPL-2.0",
]);

const key = (e: Entry) => `${e.name}@${e.version}: ${e.license}`;

/** `A OR B` vale se uma alternativa vale; `A AND B` só se as duas valem; `AND` pesa mais que `OR`; parênteses agrupam. */
function expressionAllowed(expression: string, name: string): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const atomOk = (id: string) => allowedFile.allowed.includes(id) || (allowedFile.onlyFor[id] ?? []).includes(name);
  const parseOr = (): boolean => {
    let ok = parseAnd();
    while (tokens[i] === "OR") {
      i += 1;
      ok = parseAnd() || ok;
    }
    return ok;
  };
  const parseAnd = (): boolean => {
    let ok = parseAtom();
    while (tokens[i] === "AND") {
      i += 1;
      ok = parseAtom() && ok;
    }
    return ok;
  };
  const parseAtom = (): boolean => {
    const tok = tokens[i++];
    if (tok === "(") {
      const ok = parseOr();
      i += 1; // ")"
      return ok;
    }
    return tok !== undefined && atomOk(tok);
  };
  return parseOr();
}

describe("licenças das dependências de produção", () => {
  it("a lista gerada está em dia com o package-lock.json", () => {
    expect(serialize(buildLicenses())).toBe(generatedText);
  });

  it("nenhuma dependência tem licença vazia", () => {
    expect(generated.filter((e) => !e.license.trim()).map(key)).toEqual([]);
  });

  it("toda dependência tem licença permitida ou está em NEEDS_REVIEW", () => {
    const outside = generated.filter((e) => !expressionAllowed(e.license, e.name) && !NEEDS_REVIEW.has(key(e)));
    expect(outside.map(key)).toEqual([]);
  });

  it("NEEDS_REVIEW não guarda entrada velha (saiu da lista ou passou a ser permitida)", () => {
    const stillOutside = new Set(generated.filter((e) => !expressionAllowed(e.license, e.name)).map(key));
    expect([...NEEDS_REVIEW].filter((k) => !stillOutside.has(k))).toEqual([]);
  });

  it('"a conferir" nunca passa como permitida', () => {
    expect(expressionAllowed(TO_CHECK as string, "qualquer")).toBe(false);
  });

  it("licença composta vale por uma alternativa; AND exige as duas", () => {
    expect(expressionAllowed("(MIT OR GPL-3.0-only)", "x")).toBe(true);
    expect(expressionAllowed("(ISC AND GPL-3.0-only)", "x")).toBe(false);
    expect(expressionAllowed("CC-BY-SA-3.0", "date-holidays")).toBe(true);
    expect(expressionAllowed("CC-BY-SA-3.0", "outro")).toBe(false);
  });
});
