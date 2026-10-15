/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  offlineSettingsButtons,
  runOfflineSettingsAction,
} from "../data/offlineSettingsActions";
import { statusFromNetworkCheck } from "../data/mapOfflineState";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-09 Bloco 4 guardas de ligação (e09Bloco4Wiring)", () => {
  describe("Item 1: Cancelar download no estado preso (FN-12)", () => {
    it("offlineSettingsButtons para downloading inclui cancel_download e não lista vazia", () => {
      const buttons = offlineSettingsButtons({ kind: "downloading", percent: 10 });
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons).toContainEqual(
        expect.objectContaining({
          action: "cancel_download",
          labelKey: "settings.offline_map.alert.cancel_download",
        }),
      );
    });

    it("runOfflineSettingsAction trata cancel_download chamando deleteMap uma vez e nada mais", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      const goBack = vi.fn();
      runOfflineSettingsAction("cancel_download", { startDownload, deleteMap, goBack });
      expect(deleteMap).toHaveBeenCalledTimes(1);
      expect(startDownload).not.toHaveBeenCalled();
      expect(goBack).not.toHaveBeenCalled();
    });

    it("SettingsSheet.tsx passa deleteMap: offlineMap.deleteMap no onPress dos botões", () => {
      const settings = squash(read("sheets/SettingsSheet.tsx"));
      expect(settings).toMatch(
        /runOfflineSettingsAction\(\s*b\.action,\s*\{\s*startDownload:\s*offlineMap\.startDownload,\s*deleteMap:\s*offlineMap\.deleteMap,\s*goBack:\s*handleBack,?\s*\}\s*\)/,
      );
    });
  });

  describe("Item 1: Checagem curta de conexão antes de createPack", () => {
    it("OFFLINE_CHECK_TIMEOUT_MS é exatamente 5000 ms (5 s) em mapOfflineNative.ts", () => {
      const nativeSource = read("data/mapOfflineNative.ts");
      expect(nativeSource).toMatch(/export\s+const\s+OFFLINE_CHECK_TIMEOUT_MS\s*=\s*5000\b/);
    });

    it("função pura statusFromNetworkCheck devolve error para falha e timeout, e proceed no sucesso", () => {
      expect(statusFromNetworkCheck("failed")).toEqual({ kind: "error" });
      expect(statusFromNetworkCheck("timeout")).toEqual({ kind: "error" });
      expect(statusFromNetworkCheck("ok")).toBe("proceed");
    });

    it("mapOfflineNative.ts consome o resultado da checagem antes de createPack sem ignorar com void", () => {
      const nativeSource = read("data/mapOfflineNative.ts");
      const squashed = squash(nativeSource);

      // Não ignora com void
      expect(nativeSource).not.toMatch(/void\s+statusFromNetworkCheck/);

      // Confere chamada e guarda estrito antes de createPack
      expect(squashed).toMatch(/const\s+checkDecision\s*=\s*statusFromNetworkCheck\(\s*checkOutcome\s*\);/);
      expect(squashed).toMatch(/if\s*\(\s*checkDecision\s*!==\s*"proceed"\s*\)\s*\{\s*onProgress\?\.\(\s*checkDecision\s*\);\s*throw\s+new\s+Error/);

      const decisionIdx = squashed.indexOf("statusFromNetworkCheck(checkOutcome)");
      const createPackIdx = squashed.indexOf("OfflineManager.createPack");
      expect(decisionIdx).toBeGreaterThan(-1);
      expect(createPackIdx).toBeGreaterThan(decisionIdx);
    });
  });
});
