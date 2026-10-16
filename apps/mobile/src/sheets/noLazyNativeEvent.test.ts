/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Callback passado a um `set...(` que lê `nativeEvent`: roda depois, na renderização, quando o evento já foi reciclado (E-09 bloco 19).
const LAZY_READ = /set\w+\(\s*\(?\w+(,\s*\w+)?\)?\s*=>[^;{}]*nativeEvent/g;

const SRC = join(__dirname, "..");

/** Remove comentários mantendo as quebras de linha, para o número da linha continuar certo. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, (match) => match.replace(/[^\n]/g, ""));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

/** Devolve `arquivo:linha` de cada leitura tardia de evento. */
export function lazyEventReads(source: string, file: string): string[] {
  const clean = stripComments(source);
  return [...clean.matchAll(LAZY_READ)].map((m) => `${file}:${clean.slice(0, m.index).split("\n").length}`);
}

describe("leitura tardia de nativeEvent", () => {
  it("nenhum callback passado a set...( lê nativeEvent", () => {
    const hits = tsxFiles(SRC).flatMap((path) =>
      lazyEventReads(readFileSync(path, "utf8"), path.slice(SRC.length + 1).replace(/\\/g, "/")),
    );
    expect(hits).toEqual([]);
  });

  it("pega a forma com callback e ignora a leitura imediata", () => {
    const late = "onLayout={(e) => setX((prev) => next(prev, e.nativeEvent.layout.height))}";
    const lateTwoArgs = "setX((prev, x) => f(e.nativeEvent))";
    const immediate = "onLayout={(e) => setHeight(e.nativeEvent.layout.height)}";
    const measured = "const measured = e.nativeEvent.layout.height; setPhraseHeight((prev) => next(prev, measured));";
    expect(lazyEventReads(late, "a")).toHaveLength(1);
    expect(lazyEventReads(lateTwoArgs, "a")).toHaveLength(1);
    expect(lazyEventReads(immediate, "a")).toEqual([]);
    expect(lazyEventReads(measured, "a")).toEqual([]);
    expect(lazyEventReads("// setX((p) => e.nativeEvent)", "a")).toEqual([]);
  });
});

