/**
 * Camada de adaptação da posição do aparelho (E-07 §3.3, D-108): é aqui, e só aqui, que o `expo-location` é lido.
 * As telas e os provedores falam com um `PositionPort`; o módulo nativo entra por `require` dentro das funções, como em
 * `placeLocation.ts`, para o teste rodar no Node sem ele.
 *
 * Só "Ao usar o app" (foreground). Nada de segundo plano, nada de rastreio: uma leitura por pedido.
 * Nenhuma função daqui lança: erro vira `null`.
 */
import type { PositionFix } from "@notebus/domain";
import { realNow } from "./clock";

export type PermissionState = "granted" | "denied" | "undetermined";

export interface RawFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

/** Abaixo disto o `timestamp` está em segundos (1e11 s é o ano 5138; 1e11 ms é março de 1973). */
const SECONDS_BELOW = 1e11;
/** Uma última posição conhecida mais velha que isto não serve de ponto de partida: pede-se uma nova. */
const LAST_KNOWN_MAX_AGE_MS = 120_000;

/** A leitura do aparelho no formato do domínio (`atMs` em ms), ou `null` se ela não presta. */
export function normalizeFix(raw: RawFix): PositionFix | null {
  const { latitude, longitude } = raw;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (!Number.isFinite(raw.timestamp)) return null;
  const atMs = raw.timestamp < SECONDS_BELOW ? raw.timestamp * 1000 : raw.timestamp;
  const accuracyM = typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy) && raw.accuracy >= 0 ? raw.accuracy : null;
  return { lat: latitude, lon: longitude, accuracyM, atMs };
}

export interface PositionPort {
  permission(): Promise<PermissionState>;
  request(): Promise<"granted" | "denied">;
  read(): Promise<PositionFix | null>;
}

type LocationModule = typeof import("expo-location");

function loadLocation(): LocationModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-location") as LocationModule;
}

type NativeFix = { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number };
const toFix = (pos: NativeFix | null | undefined): PositionFix | null =>
  pos ? normalizeFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp }) : null;

/** A implementação real. `read()` tenta a última posição conhecida e, se faltar ou for velha, pede uma nova (Balanced). */
export function createExpoPositionPort(now: () => number = realNow, load: () => LocationModule = loadLocation): PositionPort {
  const loadLocation = load;
  return {
    async permission() {
      try {
        const { status } = await loadLocation().getForegroundPermissionsAsync();
        return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
      } catch {
        return "denied";
      }
    },
    async request() {
      try {
        const { status } = await loadLocation().requestForegroundPermissionsAsync();
        return status === "granted" ? "granted" : "denied";
      } catch {
        return "denied";
      }
    },
    async read() {
      try {
        const Location = loadLocation();
        const last = toFix(await Location.getLastKnownPositionAsync());
        if (last && now() - last.atMs <= LAST_KNOWN_MAX_AGE_MS) return last;
        const fresh = toFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        return fresh ?? last;
      } catch {
        return null;
      }
    },
  };
}
