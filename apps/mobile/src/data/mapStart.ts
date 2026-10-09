/**
 * Onde o mapa abre no Início (E-07 §3.7, D-096 e D-110, T-67).
 * Puro: sem React, sem relógio direto (recebe nowMs).
 * Decide uma vez o centro inicial usando chooseMapOpening do domínio.
 */
import {
  DOMAIN_CONFIG,
  type DomainConfig,
  type GeoPoint,
  type MapOpening,
  type PositionFix,
  chooseMapOpening,
  validateLocation,
} from "@notebus/domain";
import type { PermissionState } from "./devicePosition";

export const MAP_START_GPS_WAIT_MS = 1_500;
export const MAP_START_PLACES_WAIT_MS = 3_000;

export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

export interface CanStartMapOpeningInput {
  placesStatus: "loading" | "ready" | "error";
  elapsedMs?: number;
  placesTimeoutMs?: number;
}

export function canStartMapOpening(input: CanStartMapOpeningInput): boolean {
  if (input.placesStatus === "ready" || input.placesStatus === "error") {
    return true;
  }
  const timeout = input.placesTimeoutMs ?? MAP_START_PLACES_WAIT_MS;
  return (input.elapsedMs ?? 0) >= timeout;
}

export interface MapStartInput {
  permission: PermissionState;
  getFix: () => PositionFix | null;
  subscribeFix?: (listener: () => void) => () => void;
  home?: GeoPoint | null;
  getHome?: () => GeoPoint | null;
  placesStatus?: () => "loading" | "ready" | "error";
  subscribePlaces?: (listener: () => void) => () => void;
  lastMapPosition: GeoPoint | null;
  nowMs: number | (() => number);
  timeoutMs?: number;
  placesTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  config?: DomainConfig;
}

export function findCasaPoint(
  places: readonly { name: string; lat: number | null; lon: number | null; deletedAt?: number | null }[],
): GeoPoint | null {
  const casa = places.find(
    (p) => (p.deletedAt === null || p.deletedAt === undefined) && p.name.trim().toLowerCase() === "casa",
  );
  if (!casa || casa.lat === null || casa.lon === null) return null;
  const point = { lat: casa.lat, lon: casa.lon };
  return validateLocation(point, null, "suggested").ok ? point : null;
}

export interface MapStarter {
  resolve(): Promise<MapOpening>;
  getOpening(): MapOpening | null;
}

export function createMapStarter(input: MapStartInput): MapStarter {
  let opening: MapOpening | null = null;
  let resolvingPromise: Promise<MapOpening> | null = null;

  async function resolve(): Promise<MapOpening> {
    if (opening !== null) return opening;
    if (resolvingPromise !== null) return resolvingPromise;

    resolvingPromise = (async () => {
      const config = input.config ?? DOMAIN_CONFIG;
      const timeoutMs = input.timeoutMs ?? MAP_START_GPS_WAIT_MS;

      // Se a permissão é granted e ainda não há fix, espera até timeoutMs pelo fix
      if (input.permission === "granted" && input.getFix() === null && input.subscribeFix) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: (() => void) | undefined;

        const timeoutPromise = new Promise<void>((res) => {
          if (input.sleep) {
            void input.sleep(timeoutMs).then(res);
          } else {
            timer = setTimeout(res, timeoutMs);
          }
        });

        const fixPromise = new Promise<void>((res) => {
          unsubscribe = input.subscribeFix!(() => {
            if (input.getFix() !== null) {
              res();
            }
          });
        });

        await Promise.race([timeoutPromise, fixPromise]);
        if (timer !== undefined) clearTimeout(timer);
        if (unsubscribe) unsubscribe();
      }

      // Se lugares ainda estão carregando, espera até placesTimeoutMs pelo ready
      let home = input.home ?? null;
      if (input.placesStatus && input.placesStatus() === "loading" && input.subscribePlaces) {
        let placesTimer: ReturnType<typeof setTimeout> | undefined;
        let unsubPlaces: (() => void) | undefined;
        const placesTimeout = input.placesTimeoutMs ?? MAP_START_PLACES_WAIT_MS;

        const timeoutPlacesPromise = new Promise<void>((res) => {
          if (input.sleep) {
            void input.sleep(placesTimeout).then(res);
          } else {
            placesTimer = setTimeout(res, placesTimeout);
          }
        });

        const readyPlacesPromise = new Promise<void>((res) => {
          unsubPlaces = input.subscribePlaces!(() => {
            const status = input.placesStatus!();
            if (status === "ready" || status === "error") {
              res();
            }
          });
        });

        await Promise.race([timeoutPlacesPromise, readyPlacesPromise]);
        if (placesTimer !== undefined) clearTimeout(placesTimer);
        if (unsubPlaces) unsubPlaces();

        if (input.getHome) {
          home = input.getHome();
        }
      }

      const now = typeof input.nowMs === "function" ? input.nowMs() : input.nowMs;
      const decided = chooseMapOpening(
        {
          fix: input.getFix(),
          nowMs: now,
          home,
          lastMapPosition: input.lastMapPosition,
        },
        config,
      );

      opening = decided;
      return decided;
    })();

    return resolvingPromise;
  }

  return {
    resolve,
    getOpening: () => opening,
  };
}

export async function resolveMapStart(input: MapStartInput): Promise<MapOpening> {
  const starter = createMapStarter(input);
  return await starter.resolve();
}
