/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 12:
 * L16: useMemo de searching em NetworkSheet.tsx chama isSearching(term) e tem [term] nas dependências.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-08.5 bloco 12 guardas de ligação", () => {
  describe("L16: NetworkSheet.tsx searching useMemo", () => {
    it("searching é useMemo(() => isSearching(term), [term]) com term nas dependências", () => {
      const networkSheet = squash(read("sheets/NetworkSheet.tsx"));
      const match = networkSheet.match(/const searching = useMemo\(\(\) => isSearching\(term\), \[([^\]]*)\]\);/);
      expect(match, "const searching = useMemo(() => isSearching(term), [...]) não encontrado").not.toBeNull();
      const deps = match![1]!.split(",").map((d) => d.trim()).filter(Boolean);
      expect(deps).toContain("term");
    });
  });

  describe("Item 1 (1b): StopSheet.tsx openAhead passa dayType do chip", () => {
    it("openAhead empilha ahead com dayType", () => {
      const stopSheet = squash(read("sheets/StopSheet.tsx"));
      expect(stopSheet).toMatch(/dispatch\(\{\s*type:\s*"push",\s*sheet:\s*\{[^}]*kind:\s*"ahead"[^}]*dayType:/);
    });
  });
});
