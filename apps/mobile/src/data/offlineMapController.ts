/**
 * Máquina de transição de estado pura do mapa offline (E-07 7b Bloco 6b).
 * Sem React, sem MapLibre.
 */
import { snoozedUntil, type OfflineMapStatus } from "./mapOfflineState";

export interface OfflineControllerState {
  status: OfflineMapStatus;
  mapVisible: boolean;
  snoozedUntilMs: number | null;
}

export type OfflineMapEvent =
  | { type: "status_loaded"; status: OfflineMapStatus }
  | { type: "map_visible_changed"; mapVisible: boolean }
  | { type: "download_started" }
  | { type: "download_progress"; percent: number }
  | { type: "download_completed"; bytes: number }
  | { type: "download_failed" }
  | { type: "snoozed"; untilMs: number }
  | { type: "map_deleted" };

export function mapShownForOffer(failed: boolean, hasOpening: boolean): boolean {
  return !failed && hasOpening;
}

export function canStartOfflineDownload(status: OfflineMapStatus): boolean {
  return status.kind !== "downloading";
}

export async function applyOfflineSnooze(
  nowMs: number,
  deps: {
    dispatch: (untilMs: number) => void;
    write: ((untilMs: number, nowMs: number) => Promise<void>) | null;
  },
): Promise<void> {
  const until = snoozedUntil(nowMs);
  deps.dispatch(until);
  if (deps.write !== null) {
    await deps.write(until, nowMs);
  }
}

export function reduceOfflineMap(
  state: OfflineControllerState,
  event: OfflineMapEvent,
): OfflineControllerState {
  switch (event.type) {
    case "status_loaded":
      return { ...state, status: event.status };

    case "map_visible_changed":
      return { ...state, mapVisible: event.mapVisible };

    case "download_started": {
      // Ignora início se já estiver baixando
      if (!canStartOfflineDownload(state.status)) {
        return state;
      }
      return {
        ...state,
        status: { kind: "downloading", percent: 0 },
      };
    }

    case "download_progress": {
      const currentPercent = state.status.kind === "downloading" ? state.status.percent : 0;
      // Progresso monotônico: nunca regride
      const percent = Math.min(100, Math.max(currentPercent, Math.floor(event.percent)));
      return {
        ...state,
        status: { kind: "downloading", percent },
      };
    }

    case "download_completed":
      return {
        ...state,
        status: { kind: "ready", bytes: Math.max(0, event.bytes) },
      };

    case "download_failed":
      return {
        ...state,
        status: { kind: "error" },
      };

    case "snoozed":
      return {
        ...state,
        snoozedUntilMs: event.untilMs,
      };

    case "map_deleted":
      return {
        ...state,
        status: { kind: "none" },
      };

    default:
      return state;
  }
}
