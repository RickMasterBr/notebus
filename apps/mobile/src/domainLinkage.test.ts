import { describe, it, expect } from "vitest";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import config from "../vitest.config";

// Prova que o pacote le o dominio da propria pista (ideia 217). Nao prova que o Vitest carrega o dominio em tempo de execucao.
const pacote = fileURLToPath(new URL("..", import.meta.url));
const dominio = realpathSync(path.resolve(pacote, "../../packages/domain"));

function resolverNoTs(nome: string): string | undefined {
  const tsconfig = path.join(pacote, "tsconfig.json");
  const lido = ts.readConfigFile(tsconfig, ts.sys.readFile);
  const opcoes = ts.parseJsonConfigFileContent(lido.config, ts.sys, pacote).options;
  const r = ts.resolveModuleName(nome, path.join(pacote, "src", "x.ts"), opcoes, ts.sys);
  const achado = r.resolvedModule?.resolvedFileName;
  return achado === undefined ? undefined : realpathSync(achado);
}

describe("ligacao com o dominio da pista", () => {
  it("tsconfig resolve @notebus/domain para o dominio ao lado do pacote", () => {
    expect(resolverNoTs("@notebus/domain")).toBe(path.join(dominio, "src", "index.ts"));
  });

  it("tsconfig resolve o caminho profundo para o dominio ao lado do pacote", () => {
    expect(resolverNoTs("@notebus/domain/src/ids.ts")).toBe(path.join(dominio, "src", "ids.ts"));
  });

  it("vitest.config tem resolve.alias para o mesmo lugar, caminho profundo antes do exato", () => {
    const alias = config.resolve?.alias as { find: RegExp; replacement: string }[];
    expect(alias).toHaveLength(2);
    const [profundo, exato] = alias as [(typeof alias)[number], (typeof alias)[number]];
    expect(profundo.find.test("@notebus/domain/src/ids.ts")).toBe(true);
    expect(exato.find.test("@notebus/domain")).toBe(true);
    expect(realpathSync(profundo.replacement.replace("$1", "src/ids.ts"))).toBe(path.join(dominio, "src", "ids.ts"));
    expect(realpathSync(exato.replacement)).toBe(path.join(dominio, "src", "index.ts"));
  });
});
