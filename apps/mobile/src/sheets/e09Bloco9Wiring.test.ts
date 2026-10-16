/// <reference types="node" />
/**
 * Guardas de ligação do E-09 Bloco 9:
 * 1. Entrada `diag` e passo do SHA em `.github/workflows/ios.yml`
 * 2. Eventos de diagnóstico de folha coberta e reabertura em `StackedSheet.tsx`
 * 3. Ligação de DIAG_SCROLL via `isDiagEnabled(process.env.EXPO_PUBLIC_NOTEBUS_DIAG)` em `diagScroll.tsx`
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

const readRaw = (rel: string) =>
  readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-09 Bloco 9 guardas de ligação (e09Bloco9Wiring)", () => {
  describe("Item 3: Workflow ios.yml com entrada diag, env e passo do SHA", () => {
    const workflowPath = "../../../.github/workflows/ios.yml";
    const workflowRaw = readRaw(workflowPath);
    const workflowSquash = squash(workflowRaw);

    it("entrada diag existe, é do tipo boolean e default: false", () => {
      expect(workflowSquash).toMatch(
        /diag:\s*description:\s*"Build de diagnóstico: mostra a faixa da pilha de folhas no topo da tela\. Em build normal, deixe desmarcado\."\s*type:\s*boolean\s*default:\s*false/,
      );
    });

    it("env do job possui EXPO_PUBLIC_NOTEBUS_DIAG: ${{ inputs.diag && '1' || '' }} inteiro", () => {
      expect(workflowSquash).toMatch(
        /EXPO_PUBLIC_NOTEBUS_DIAG:\s*\${{\s*inputs\.diag\s*&&\s*'1'\s*\|\|\s*''\s*}}/,
      );
    });

    it("passo de registro do SHA existe antes do prebuild", () => {
      expect(workflowRaw).toMatch(
        /echo\s+"EXPO_PUBLIC_BUILD_SHA=\$\{GITHUB_SHA::7\}"\s*>>\s*"\$GITHUB_ENV"/,
      );
      const shaIndex = workflowRaw.indexOf("echo \"EXPO_PUBLIC_BUILD_SHA=${GITHUB_SHA::7}\" >> \"$GITHUB_ENV\"");
      const prebuildIndex = workflowRaw.indexOf("npx expo prebuild --platform ios");
      expect(shaIndex).toBeGreaterThan(-1);
      expect(prebuildIndex).toBeGreaterThan(shaIndex);
    });

    it("nome do artefato inclui sufixo -diag quando inputs.diag", () => {
      expect(workflowSquash).toMatch(
        /\${{\s*inputs\.diag\s*&&\s*'-diag'\s*\|\|\s*''\s*}}/,
      );
    });
  });

  describe("Item 2: Guardas de uso em StackedSheet.tsx", () => {
    const stackedSheetSquash = squash(read("sheets/StackedSheet.tsx"));

    it("pop() registra 'coberta fechou #${id}' sob if (DIAG_SCROLL) antes de return quando !isTopRef.current", () => {
      const popMatch = stackedSheetSquash.match(
        /const\s+pop\s*=\s*useCallback\(\(\)\s*=>\s*\{(.*?)\},\s*\[dispatch,\s*id\]\);/,
      );
      expect(popMatch).not.toBeNull();
      const popBody = popMatch![1];
      expect(popBody).toMatch(
        /if\s*\(\s*!isTopRef\.current\s*\)\s*\{\s*closedWhileCovered\.current\s*=\s*true;\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(\s*`coberta fechou #\$\{id\}`\s*\);\s*return;\s*\}/,
      );
    });

    it("useEffect reabre folha e registra 'reabrir #${id}' sob if (DIAG_SCROLL) junto de snapToIndex", () => {
      const effectMatch = stackedSheetSquash.match(
        /useEffect\(\(\)\s*=>\s*\{(.*?)\},\s*\[isTop,\s*detents\?\.initialIndex\]\);/,
      );
      expect(effectMatch).not.toBeNull();
      const effectBody = effectMatch![1];
      expect(effectBody).toMatch(
        /if\s*\(\s*isTop\s*&&\s*closedWhileCovered\.current\s*\)\s*\{\s*closedWhileCovered\.current\s*=\s*false;\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(\s*`reabrir #\$\{id\}`\s*\);\s*ref\.current\?\.snapToIndex\(/,
      );
    });
  });

  describe("Item 1: Guarda de uso em diagScroll.tsx", () => {
    const diagScrollSquash = squash(read("sheets/diagScroll.tsx"));

    it("diagScroll.tsx usa isDiagEnabled(process.env.EXPO_PUBLIC_NOTEBUS_DIAG)", () => {
      expect(diagScrollSquash).toMatch(
        /export\s+const\s+DIAG_SCROLL\s*=\s*isDiagEnabled\(\s*process\.env\.EXPO_PUBLIC_NOTEBUS_DIAG\s*\);/,
      );
    });
  });
});
