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

describe("E-09 Bloco 7 guardas de ligação (e09Bloco7Wiring)", () => {
  describe("Item 1 · Ajustes › Sobre", () => {
    const settings = squash(read("sheets/SettingsSheet.tsx"));
    const about = squash(read("sheets/AboutPage.tsx"));

    it("a linha Sobre da raiz abre a página about", () => {
      expect(settings).toMatch(
        /<SettingsIndexRow title=\{t\("settings\.about\.title"\)\} onPress=\{\(\) => dispatchNav\(\{ type: "open", page: "about" \}\)\} \/>/,
      );
    });

    it("a página about monta o AboutPage", () => {
      expect(settings).toContain('{page === "about" && <AboutPage />}');
    });

    it("as 7 batidas continuam na linha Versão da raiz", () => {
      expect(settings).toMatch(
        /accessibilityLabel=\{`\$\{t\("settings\.version"\)\} \$\{VERSION_TEXT\}`\} onPress=\{\(\) => counter\.tap\(realNow\(\)\) && dispatch\(\{ type: "push", sheet: \{ kind: "clockPicker" \} \}\) \}/,
      );
    });

    it("o AboutPage lê os campos de about.ts por nome, na ordem da página", () => {
      const order = [
        "value={view.appVersion}",
        "value={view.schemaVersion}",
        "value={view.dataVersion}",
        "{view.creditHolidays}",
        "{view.creditMap}",
        't("settings.about.licenses")',
        "view.noticeLines.map(",
      ];
      const positions = order.map((snippet) => about.indexOf(snippet));
      expect(positions.every((p) => p > -1), order.filter((_, i) => positions[i] === -1).join(" | ")).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it("as versões vêm das mesmas funções que o backup usa", () => {
      expect(about).toContain('import { installedDatasets, schemaVersion } from "../db/backup";');
      expect(about).toContain("void schemaVersion(raw).then(setSchema);");
      expect(about).toContain("void installedDatasets(raw).then(setDatasets);");
      expect(about).toContain("aboutView({ appVersion: APP_VERSION, schemaVersion: schema, datasets })");
    });

    it("a linha das licenças alterna a lista e informa o estado expandido", () => {
      expect(about).toContain("onPress={() => setLicensesOpen((open) => !open)}");
      expect(about).toContain("accessibilityState={expanded === undefined ? undefined : { expanded }}");
      expect(about).toContain("licenseRows(licenses.packages)");
    });

    it("as linhas tocáveis são botões com rótulo e alvo mínimo", () => {
      expect(about).toMatch(/<Pressable accessibilityRole="button" accessibilityLabel=\{accessibilityLabel\}/);
      expect(about).toMatch(/link: \{ minHeight: minTouch,/);
    });
  });

  describe("Item 3 · '+ N paragens' que expande (Q-101)", () => {
    const ahead = squash(read("sheets/AheadSheet.tsx"));

    it("a linha vira botão com rótulo, estado expandido e onPress que alterna a lacuna", () => {
      expect(ahead).toContain(
        '<Pressable accessibilityRole="button" accessibilityLabel={t("terminal_detail.gap.a11y", { count })} accessibilityState={{ expanded: open }} onPress={onPress}',
      );
      expect(ahead).toContain("onPress={() => setOpenGaps((open) => toggleGap(open, item.id))}");
    });

    it("a linha do tempo vem de shownTimeline com o estado das lacunas abertas", () => {
      expect(ahead).toContain("const items = shownTimeline(ahead.here, ahead.stops, openGaps);");
    });

    it("a lacuna recebe aberta/fechada do item e tem alvo mínimo", () => {
      expect(ahead).toContain("<GapRow key={`gap-${item.id}`} count={item.count} open={item.open}");
      expect(ahead).toContain("gapRow: { minHeight: minTouch }");
    });
  });
});
