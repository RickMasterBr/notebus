/**
 * Variante do build (E-02 bloco 3a, item 9). `normal` devolve a configuração do `app.json` sem mexer em nada;
 * `dev` muda só o nome e o `bundleIdentifier`, para o iPhone tratar como outro app e instalar ao lado do normal.
 */
import type { ExpoConfig } from "expo/config";

export type Variant = "normal" | "dev";

export const DEV_BUNDLE_ID = "com.rickmasterbr.notebus.dev";
export const DEV_NAME = "NoteBus Dev";

/** Qualquer valor que não seja exatamente "dev" (vazio, ausente, erro de digitação) vira `normal`. */
export function parseVariant(value: string | undefined): Variant {
  return value === "dev" ? "dev" : "normal";
}

export function applyVariant(config: ExpoConfig, variant: Variant): ExpoConfig {
  if (variant === "normal") return config;
  return { ...config, name: DEV_NAME, ios: { ...config.ios, bundleIdentifier: DEV_BUNDLE_ID } };
}
