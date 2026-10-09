/**
 * Leitura de localização para lugares (E-05 §4.1, D-096, RNF-05, Q-97).
 *
 * Uma única leitura ao toque do usuário ("Usar minha localização agora").
 * Isolado de chamadas nativas diretas para permitir testes sem o módulo nativo do Expo.
 * Se a permissão for recusada ou falhar, devolve null sem bloquear nada.
 */

import { validateLocation } from "@notebus/domain";

export interface LocationCoords {
  lat: number;
  lon: number;
  accuracyM?: number | null;
}

export type LocationReader = () => Promise<LocationCoords | null>;

/**
 * Lê a coordenada atual usando o reader injetado.
 * Tratamento seguro: qualquer recusa ou erro devolve null.
 */
export async function getPlaceLocation(
  readLocation: LocationReader,
): Promise<LocationCoords | null> {
  try {
    return await readLocation();
  } catch {
    return null;
  }
}

/**
 * Leitor nativo com expo-location para uso no app.
 * Pede permissão foreground se necessário; se recusada, devolve null.
 */
export async function readNativeLocation(): Promise<LocationCoords | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Location = require("expo-location") as typeof import("expo-location");
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    return null;
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
  };
}

export type PlaceLocationCheck =
  | { kind: "ok" }
  | { kind: "far" }
  | { kind: "imprecise"; accuracyM: number | null }
  | { kind: "invalid" };

/** Conferência da leitura antes de gravar (T-70): o `validateLocation` do domínio, no modo "usar minha localização agora". */
export function checkPlaceLocation(loc: LocationCoords): PlaceLocationCheck {
  const accuracyM = loc.accuracyM ?? null;
  const check = validateLocation({ lat: loc.lat, lon: loc.lon }, accuracyM, "manual");
  if (!check.ok) return check.reason === "imprecise" ? { kind: "imprecise", accuracyM } : { kind: "invalid" };
  return "farFromLeiria" in check ? { kind: "far" } : { kind: "ok" };
}
