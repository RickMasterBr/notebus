/// <reference types="node" />
/**
 * Guardas de ligação da E-09 bloco 17:
 * Item B (FN-26): toast da descida com "Ajustar" abrindo RecordSheet da descida.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("e09Bloco17Wiring (Item B: FN-26 toast alight com Ajustar)", () => {
  const provider = squash(read("data/RegistroProvider.tsx"));

  it("toast da descida inclui secondaryAction com rótulo do catálogo e chama openRecordSheet(token.observationId)", () => {
    // Localiza a função alight no provider
    const alightFn = provider.slice(provider.indexOf("const alight = useCallback("));
    const alightBlock = alightFn.slice(0, alightFn.indexOf("const notBoarded = useCallback("));

    // Deve conter secondaryAction no toast.show
    expect(alightBlock).toMatch(/toast\.show\(\{[\s\S]*?secondaryAction:\s*\{[\s\S]*?label:\s*t\("toast\.action\.adjust"\)[\s\S]*?run:\s*\(\)\s*=>\s*\{[\s\S]*?openRecordSheet\(\s*token\.observationId\s*\);?[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}\);/);
  });
});
