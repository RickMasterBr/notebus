/**
 * Regras do seletor de posição no mapa (E-07 §3.7, D-096, D-107, D-110).
 * Puro: sem React, sem relógio direto.
 */
import {
  type GeoPoint,
  type MapOpeningSource,
  type PositionFix,
  chooseMapOpening,
  validateLocation,
} from "@notebus/domain";

export type PickStartSource = "existing" | MapOpeningSource;
export interface PickStart {
  point: GeoPoint;
  source: PickStartSource;
  zoom: number;
  pin: GeoPoint | null;
}
export const PICK_ZOOM_EXISTING = 16;
export const PICK_ZOOM_OPENING = 14;

export function pickStart(input: {
  existing: GeoPoint | null;
  fix: PositionFix | null;
  nowMs: number;
  home: GeoPoint | null;
  lastMapPosition: GeoPoint | null;
}): PickStart {
  if (input.existing !== null && validateLocation(input.existing, null, "suggested").ok) {
    return {
      point: input.existing,
      source: "existing",
      zoom: PICK_ZOOM_EXISTING,
      pin: input.existing,
    };
  }

  const opening = chooseMapOpening({
    fix: input.fix,
    nowMs: input.nowMs,
    home: input.home,
    lastMapPosition: input.lastMapPosition,
  });

  return {
    point: opening.point,
    source: opening.source,
    zoom: PICK_ZOOM_OPENING,
    pin: null,
  };
}

export interface PickState {
  pin: GeoPoint | null;
}

export function tapPin(state: PickState, point: GeoPoint): PickState {
  if (!validateLocation(point, null, "suggested").ok) {
    return state;
  }
  return { pin: point };
}

export type PickResult =
  | { kind: "disabled" }
  | { kind: "ok"; point: GeoPoint }
  | { kind: "far"; point: GeoPoint };

export function resolvePick(state: PickState): PickResult {
  if (state.pin === null) {
    return { kind: "disabled" };
  }
  const check = validateLocation(state.pin, null, "suggested");
  if (!check.ok) {
    return { kind: "disabled" };
  }
  if ("farFromLeiria" in check && check.farFromLeiria) {
    return { kind: "far", point: state.pin };
  }
  return { kind: "ok", point: state.pin };
}

export type StopUndo =
  | { kind: "clear" }
  | { kind: "restore"; point: GeoPoint; source: "manual" | "suggested" };

export function undoForStopLocation(
  previous: { lat: number; lon: number; source: "manual" | "suggested" | null } | null,
): StopUndo {
  if (previous === null) {
    return { kind: "clear" };
  }
  return {
    kind: "restore",
    point: { lat: previous.lat, lon: previous.lon },
    source: previous.source ?? "manual",
  };
}
