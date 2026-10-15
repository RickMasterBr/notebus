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

describe("E-09 Bloco 3 guardas de ligação (e09Bloco3Wiring)", () => {
  describe("Item 1: SettingsSheet.tsx página map", () => {
    const settingsSheet = squash(read("sheets/SettingsSheet.tsx"));

    it("página map exibe dica explicativa de erro via offlineSettingsHint", () => {
      expect(settingsSheet).toContain("offlineSettingsHint(offlineMap.status)");
      expect(settingsSheet).toContain("const hintKey = offlineSettingsHint(offlineMap.status);");
      expect(settingsSheet).toContain("if (!hintKey) return null;");
      expect(settingsSheet).toContain(
        "<Text style={[type.caption, { color: colors.textSecondary }]}> {t(hintKey)} </Text>",
      );
    });

    it("página map passa goBack para runOfflineSettingsAction", () => {
      expect(settingsSheet).toMatch(
        /runOfflineSettingsAction\(\s*b\.action,\s*\{\s*startDownload:\s*offlineMap\.startDownload,\s*deleteMap:\s*offlineMap\.deleteMap,\s*goBack:\s*handleBack,?\s*\}\s*\)/,
      );
    });
  });

  describe("Item 2: NetworkSheet.tsx ordem da seção Pontos", () => {
    const networkSheet = squash(read("sheets/NetworkSheet.tsx"));

    it("seção Pontos adiciona busca antes de newStop, e newStop antes de stopPager", () => {
      const headerStopsIdx = networkSheet.indexOf('title: t("net.section.stops")');
      const stopSearchIdx = networkSheet.indexOf('items.push({ type: "stopSearch", id: "stop-search" });');
      const newStopIdx = networkSheet.indexOf('items.push({ type: "newStop", id: "new-stop" });');
      const stopPagerTopIdx = networkSheet.indexOf('items.push({ type: "stopPager", id: "stop-pager-top" });');

      expect(headerStopsIdx).toBeGreaterThan(-1);
      expect(stopSearchIdx).toBeGreaterThan(headerStopsIdx);
      expect(newStopIdx).toBeGreaterThan(stopSearchIdx);
      expect(stopPagerTopIdx).toBeGreaterThan(newStopIdx);
    });
  });
});
