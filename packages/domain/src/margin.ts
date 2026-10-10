import { DOMAIN_CONFIG } from "./config";

/** Margem mais alta que o app oferece (D-019): 0 a 10 minutos. */
export const MAX_MARGIN_MINUTES = 10;

/**
 * Margem do "esteja no ponto às" (D-019, E-08 §3.1) a partir de um valor qualquer (backup, texto, número): inteiro de
 * 0 a 10. Número inteiro fora da faixa encosta na ponta (40 → 10, -3 → 0); o que não é número inteiro (texto, nulo,
 * 2,5, NaN) volta ao padrão de `config.ts`.
 */
export const clampMargin = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) return DOMAIN_CONFIG.marginMinutes;
  return Math.min(MAX_MARGIN_MINUTES, Math.max(0, value));
};
