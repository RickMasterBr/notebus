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

  describe("Item 1: Guarda de fiação da falha ao baixar de novo (FN-17)", () => {
    it("OfflineMapProvider.tsx recarrega status nativo e chama resolveDownloadFailure com o status recarregado", () => {
      const providerSource = squash(read("data/OfflineMapProvider.tsx"));
      expect(providerSource).toMatch(
        /const\s+refreshed\s*=\s*await\s+getOfflineMapStatus\(\);/,
      );
      expect(providerSource).toMatch(
        /const\s+failureResult\s*=\s*resolveDownloadFailure\(\s*refreshed\s*\);/,
      );
    });

    it("OfflineMapProvider.tsx consome status por campo e despacha status_loaded quando pronto", () => {
      const providerSource = squash(read("data/OfflineMapProvider.tsx"));
      expect(providerSource).toMatch(
        /if\s*\(\s*failureResult\.status\.kind\s*===\s*"ready"\s*\)\s*\{\s*dispatch\(\s*\{\s*type:\s*"status_loaded",\s*status:\s*failureResult\.status\s*\}\s*\);/m,
      );
    });

    it("OfflineMapProvider.tsx consome showFailureNotice por campo para exibir o toast com texto offline_map.error", () => {
      const providerSource = squash(read("data/OfflineMapProvider.tsx"));
      expect(providerSource).toMatch(
        /if\s*\(\s*failureResult\.showFailureNotice\s*\)\s*\{\s*toast\.show\(\s*\{\s*title:\s*t\("offline_map\.error"\)\s*\}\s*\);/m,
      );
    });
  });

  describe("Item 2: Animação ao voltar de página nos Ajustes (FN-16)", () => {
    it("SettingsSheet.tsx usa animação ao voltar com FadeOut / SlideOutRight pelo mesmo caminho que o cabeçalho usa", () => {
      const settingsSource = squash(read("sheets/SettingsSheet.tsx"));
      expect(settingsSource).toMatch(
        /import\s+Animated,\s*\{[^}]*FadeOut[^}]*SlideOutRight[^}]*\}\s+from\s+["']react-native-reanimated["']/,
      );
      expect(settingsSource).toMatch(
        /exiting=\{reduceMotion\s*\?\s*FadeOut\.duration\(200\)\s*:\s*SlideOutRight\.duration\(280\)\}/,
      );
    });

    it("SettingsSheet.tsx passa handleBack tanto para o cabeçalho quanto para o Cancelar", () => {
      const settingsSource = squash(read("sheets/SettingsSheet.tsx"));
      // Cabeçalho de voltar
      expect(settingsSource).toMatch(
        /accessibilityLabel=\{t\("settings\.back\.a11y"\)\}\s*onPress=\{handleBack\}/,
      );
      // Cancelar em Mapa sem internet
      expect(settingsSource).toMatch(
        /runOfflineSettingsAction\(\s*b\.action,\s*\{\s*startDownload:\s*offlineMap\.startDownload,\s*deleteMap:\s*offlineMap\.deleteMap,\s*goBack:\s*handleBack,?\s*\}\s*\)/,
      );
    });
  });
});
