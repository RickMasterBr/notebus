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

export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

export interface MapStartInput {
  permission: PermissionState;
  getFix: () => PositionFix | null;
  subscribeFix?: (listener: () => void) => () => void;
  home: GeoPoint | null;
  lastMapPosition: GeoPoint | null;
  nowMs: number | (() => number);
  timeoutMs?: number;
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

      const now = typeof input.nowMs === "function" ? input.nowMs() : input.nowMs;
      const decided = chooseMapOpening(
        {
          fix: input.getFix(),
          nowMs: now,
          home: input.home,
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
