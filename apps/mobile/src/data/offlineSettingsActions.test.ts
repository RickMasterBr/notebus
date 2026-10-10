import { describe, expect, it, vi } from "vitest";
import {
  offlineSettingsButtons,
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

  describe("runOfflineSettingsAction", () => {
    it("delete chama deleteMap uma vez e startDownload nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      runOfflineSettingsAction("delete", { startDownload, deleteMap });
      expect(deleteMap).toHaveBeenCalledTimes(1);
      expect(startDownload).not.toHaveBeenCalled();
    });

    it("download_again chama startDownload uma vez e deleteMap nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      runOfflineSettingsAction("download_again", { startDownload, deleteMap });
      expect(startDownload).toHaveBeenCalledTimes(1);
      expect(deleteMap).not.toHaveBeenCalled();
    });

    it("download chama startDownload uma vez e deleteMap nenhuma", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      runOfflineSettingsAction("download", { startDownload, deleteMap });
      expect(startDownload).toHaveBeenCalledTimes(1);
      expect(deleteMap).not.toHaveBeenCalled();
    });

    it("cancel não chama nenhum dos dois", () => {
      const startDownload = vi.fn();
      const deleteMap = vi.fn();
      runOfflineSettingsAction("cancel", { startDownload, deleteMap });
      expect(startDownload).not.toHaveBeenCalled();
      expect(deleteMap).not.toHaveBeenCalled();
    });
  });
});
