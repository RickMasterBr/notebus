import type { MessageKey } from "../i18n";
import type { OfflineMapStatus } from "./mapOfflineState";

export type OfflineSettingsAction = "download" | "download_again" | "delete" | "cancel";

export interface OfflineSettingsButton {
  action: OfflineSettingsAction;
  labelKey: MessageKey;
  style: "default" | "destructive" | "cancel";
}

export function offlineSettingsButtons(status: OfflineMapStatus): OfflineSettingsButton[] {
  switch (status.kind) {
    case "downloading":
      return [];
    case "ready":
      return [
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
      ];
    case "none":
    case "error":
      return [
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
      ];
  }
}

export function runOfflineSettingsAction(
  action: OfflineSettingsAction,
  handlers: { startDownload: () => void; deleteMap: () => void },
): void {
  if (action === "download" || action === "download_again") {
    handlers.startDownload();
  } else if (action === "delete") {
    handlers.deleteMap();
  }
}
