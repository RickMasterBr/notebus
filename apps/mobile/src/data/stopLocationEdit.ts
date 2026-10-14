/**
 * Regras puras de localização no Editar ponto (F3, D-190, E-08.5 bloco 8).
 * Sem React e sem banco.
 */
import type { StopPoint } from "../db/stopLocation";
import type { MessageKey } from "../i18n/pt-BR";
import { type StopLocationKey, stopLocationStatusKey } from "./stopEdit";

export type StopOriginalLocation = {
  lat: number | null;
  lon: number | null;
  locationSource: "manual" | "suggested" | null;
};

export type LocationChange = "unchanged" | "set" | "clear";

export function locationChange(
  original: StopOriginalLocation,
  current: StopPoint | null,
): LocationChange {
  const hadLocation = original.lat !== null && original.lon !== null;
  if (!hadLocation && current === null) {
    return "unchanged";
  }
  if (hadLocation && current === null) {
    return "clear";
  }
  if (
    hadLocation &&
    current !== null &&
    original.lat === current.lat &&
    original.lon === current.lon
  ) {
    return "unchanged";
  }
  return "set";
}

export function locationEdit(
  original: StopOriginalLocation,
  current: StopPoint | null,
): StopPoint | null | undefined {
  const change = locationChange(original, current);
  if (change === "unchanged") return undefined;
  if (change === "clear") return null;
  return current;
}

export interface StopLocationViewResult {
  statusKey: StopLocationKey;
  openKey: MessageKey;
  canRemove: boolean;
  changed: boolean;
}

export function stopLocationView(
  original: StopOriginalLocation,
  current: StopPoint | null,
): StopLocationViewResult {
  const change = locationChange(original, current);
  const changed = change !== "unchanged";

  if (current === null) {
    return {
      statusKey: "stop_edit.location.none",
      openKey: "map_pick.open",
      canRemove: false,
      changed,
    };
  }

  const isSameAsOriginal =
    original.lat !== null &&
    original.lon !== null &&
    original.lat === current.lat &&
    original.lon === current.lon;

  const statusKey: StopLocationKey = isSameAsOriginal
    ? stopLocationStatusKey(original.lat, original.lon, original.locationSource)
    : "stop_edit.location.manual";

  return {
    statusKey,
    openKey: "map_pick.open",
    canRemove: true,
    changed,
  };
}
