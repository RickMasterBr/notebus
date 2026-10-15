/// <reference types="node" />
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

describe("E-09 Bloco 5 guardas de ligação (e09Bloco5Wiring)", () => {
  describe("Item 0.1: Guarda de uso da key de remontagem em App.tsx", () => {
    it("App.tsx só atualiza fontScaleState quando a escala realmente mudou (condição ancorada)", () => {
      const appSource = squash(read("../App.tsx"));
      expect(appSource).toMatch(
        /if\s*\(\s*fontScaleState\.scale\s*!==\s*fontScale\s*\)\s*\{\s*const\s+nextKey\s*=\s*nextFontScaleKey\(/,
      );
    });

    it("App.tsx chama nextFontScaleKey com os argumentos exatos (fontScaleState.scale, fontScale, fontScaleState.key)", () => {
      const appSource = squash(read("../App.tsx"));
      expect(appSource).toMatch(
        /const\s+nextKey\s*=\s*nextFontScaleKey\(\s*fontScaleState\.scale,\s*fontScale,\s*fontScaleState\.key\s*\);/,
      );
    });

    it("App.tsx atualiza fontScaleState com scale: fontScale e key: nextKey", () => {
      const appSource = squash(read("../App.tsx"));
      expect(appSource).toMatch(
        /setFontScaleState\(\s*\{\s*scale:\s*fontScale,\s*key:\s*nextKey\s*\}\s*\);/,
      );
    });

    it("App.tsx renderiza Home com key={fontScaleState.key} estritamente dentro de OfflineMapProvider", () => {
      const appSource = squash(read("../App.tsx"));
      expect(appSource).toMatch(
        /<OfflineMapProvider\s+db=\{db\}>\s*<Home\s+key=\{fontScaleState\.key\}\s*\/>\s*<\/OfflineMapProvider>/,
      );
    });
  });
});
