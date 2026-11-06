import { AX_FONT_SCALE, STACK_FONT_SCALE } from "./stackFontScale";

export type GroupedRowAccessory = "value" | "chevron" | "switch" | "none";

export type RouteStopVariant = "choose" | "read" | "passed";

/** Empilha quando a escala de fonte atinge ou supera STACK_FONT_SCALE (1.25). */
export function stackedAt(fontScale: number): boolean {
  return fontScale >= STACK_FONT_SCALE;
}

/** Escala de fonte atinge ou supera o limiar de acessibilidade AX_FONT_SCALE (2.6). */
export function axAt(fontScale: number): boolean {
  return fontScale >= AX_FONT_SCALE;
}

/** A barra superior mostra o texto 'Voltar' só abaixo do limiar AX (topBarShowsBackText = !axAt). */
export function topBarShowsBackText(fontScale: number): boolean {
  return !axAt(fontScale);
}

/** O acessório de valor da linha agrupada fica abaixo do título se for 'value' e empilhar. */
export function groupedRowValueBelow(
  fontScale: number,
  accessory: GroupedRowAccessory,
): boolean {
  return accessory === "value" && stackedAt(fontScale);
}

/** Determina a variante da linha de paragem pelo estado de toque e passagem. */
export function routeStopVariant(input: {
  pickable: boolean;
  passed: boolean;
}): RouteStopVariant {
  if (!input.pickable) return "read";
  if (input.passed) return "passed";
  return "choose";
}
