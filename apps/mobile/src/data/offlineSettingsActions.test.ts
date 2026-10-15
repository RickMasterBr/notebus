import { describe, expect, it, vi } from "vitest";
import {
  offlineSettingsButtons,
  offlineSettingsHint,
  runOfflineSettingsAction,
} from "./offlineSettingsActions";

describe("offlineSettingsActions (Item 0.4 puro)", () => {
  describe("offlineSettingsButtons", () => {
    it("downloading → lista vazia", () => {
      expect(offlineSettingsButtons({ kind: "downloading", percent: 50 })).toEqual([]);
      expect(offlineSettingsButtons({ kind: "downloading", percent: 0 })).toEqual([]);
    });

    it("ready → download_again, delete, cancel (ação, chave, estilo, ordem)", () => {
      const buttons = offlineSettingsButtons({ kind: "ready", bytes: 10_000_000 });
      expect(buttons).toEqual([
        {
          action: "download_again",
          labelKey: "settings.offline_map.alert.download_again",
          style: "default",
        },
        {
          action: "delete",
          labelKey: "settings.offline_map.alert.delete",
          style: "destructive",
        },
        {
          action: "cancel",
          labelKey: "common.cancel",
          style: "cancel",
        },
      ]);
    });

    it("none → download, cancel", () => {
      const buttons = offlineSettingsButtons({ kind: "none" });
      expect(buttons).toEqual([
        {
          action: "download",
          labelKey: "settings.offline_map.alert.download",
          style: "default",
        },
        {
          action: "cancel",
          labelKey: "common.cancel",
          style: "cancel",
        },
      ]);
    });

    it("error → download, cancel", () => {
      const buttons = offlineSettingsButtons({ kind: "error" });
      expect(buttons).toEqual([
        {
          action: "download",
          labelKey: "settings.offline_map.alert.download",
          style: "default",
        },
        {
          action: "cancel",
          labelKey: "common.cancel",
          style: "cancel",
        },
      ]);
    });
  });

  describe("offlineSettingsHint", () => {
    it("ready devolve settings.map.ready_hint", () => {
      expect(offlineSettingsHint({ kind: "ready", bytes: 10_000_000 })).toBe("settings.map.ready_hint");
    });

    it("error devolve offline_map.error (texto explicativo da falha)", () => {
      expect(offlineSettingsHint({ kind: "error" })).toBe("offline_map.error");
    });

    it("none e downloading devolvem null", () => {
      expect(offlineSettingsHint({ kind: "none" })).toBeNull();
      expect(offlineSettingsHint({ kind: "downloading", percent: 50 })).toBeNull();
    });
  });

  describe("runOfflineSettingsAction", () => {
    it("delete chama deleteMap uma vez e startDownload nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      const goBack = vi.fn();
      runOfflineSettingsAction("delete", { startDownload, deleteMap, goBack });
      expect(deleteMap).toHaveBeenCalledTimes(1);
      expect(startDownload).not.toHaveBeenCalled();
      expect(goBack).not.toHaveBeenCalled();
    });

    it("download_again chama startDownload uma vez e deleteMap nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      const goBack = vi.fn();
      runOfflineSettingsAction("download_again", { startDownload, deleteMap, goBack });
      expect(startDownload).toHaveBeenCalledTimes(1);
      expect(deleteMap).not.toHaveBeenCalled();
      expect(goBack).not.toHaveBeenCalled();
    });

    it("download chama startDownload uma vez e deleteMap nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      const goBack = vi.fn();
      runOfflineSettingsAction("download", { startDownload, deleteMap, goBack });
      expect(startDownload).toHaveBeenCalledTimes(1);
      expect(deleteMap).not.toHaveBeenCalled();
      expect(goBack).not.toHaveBeenCalled();
    });

    it("cancel chama goBack uma vez e não chama startDownload nem deleteMap", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      const goBack = vi.fn();
      runOfflineSettingsAction("cancel", { startDownload, deleteMap, goBack });
      expect(goBack).toHaveBeenCalledTimes(1);
      expect(startDownload).not.toHaveBeenCalled();
      expect(deleteMap).not.toHaveBeenCalled();
    });
  });
});
