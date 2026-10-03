/**
 * Tokens do design system (docs/ux/4.4-design-system.md §1–4), copiados sem reinterpretar.
 * Cor muda com o tema; o resto (tipografia, espaço, raio, movimento) é igual nos dois.
 */
import type { TextStyle, ViewStyle } from "react-native";

export interface ColorTokens {
  bg: string;
  surface: string;
  text: string;
  textSecondary: string;
  divider: string;
  accent: string;
  onAccent: string;
  danger: string;
  warning: string;
  /** Trilho do switch desligado (D-067, refina a D-055). */
  switchTrackOff: string;
  /**
   * Do canvas da 4.5 (Main.dc.html), que a 4.4 não lista (Q-51): fundo da pílula de busca sobre a folha
   * (a 4.4 §5.9 diz `surface`, que some contra a folha) e cor do handle (a 4.4 §5.11 diz `divider`).
   */
  fill: string;
  grab: string;
  /** Fundo que escurece a folha de baixo quando outra é empilhada: 28% claro, 50% escuro (4.5 §2.5, D-043). */
  scrim: string;
}

/**
 * §1.1, §1.2 e §1.4, já com as revisões da 4.5: D-041 (`success` saiu; `warning` claro #9A5B00; `danger` só como texto)
 * e D-067 (`switchTrackOff`; no escuro, #48494D).
 */
export const colors: { light: ColorTokens; dark: ColorTokens } = {
  light: {
    bg: "#F4F3EF",
    surface: "#FFFFFF",
    text: "#1C1C1E",
    textSecondary: "#5F6368",
    divider: "#E3E3E0",
    accent: "#5B4BD6",
    onAccent: "#FFFFFF",
    danger: "#C62828",
    warning: "#9A5B00",
    switchTrackOff: "#8A8A8E",
    fill: "#F0F0ED",
    grab: "#C7C7C2",
    scrim: "rgba(0,0,0,0.28)",
  },
  dark: {
    bg: "#121314",
    surface: "#1E1F21",
    text: "#F2F2F0",
    textSecondary: "#A1A1A6",
    divider: "#333538",
    accent: "#A99FFF",
    onAccent: "#1C1C1E",
    danger: "#FF8A80",
    warning: "#FFC46B",
    switchTrackOff: "#48494D",
    fill: "#2C2D30",
    grab: "#48494D",
    scrim: "rgba(0,0,0,0.5)",
  },
};

/** §1.3: mesma cor nos dois temas. `darkText` = número escuro sobre a cor; `outline` = contorno no escuro (< 3:1). */
export const lineColors: Record<string, { color: string; darkText: boolean; outline: boolean }> = {
  "1": { color: "#7CB342", darkText: true, outline: false },
  "2": { color: "#D32F2F", darkText: false, outline: false },
  "3": { color: "#4FC3F7", darkText: true, outline: false },
  "4": { color: "#1E3A8A", darkText: false, outline: true },
  "5": { color: "#2E7D32", darkText: false, outline: false },
  "6": { color: "#C7017F", darkText: false, outline: true },
  "7": { color: "#F57C00", darkText: true, outline: false },
  "8": { color: "#FDD835", darkText: true, outline: false },
  "9": { color: "#1C1C1E", darkText: false, outline: true },
};
/** `color.line-outline`: branco a 45%, 1,5 px. */
export const lineOutline = { color: "rgba(255,255,255,0.45)", width: 1.5 } as const;

/** §2. Números de horário usam `tabular` (nums tabulares). */
export const type = {
  wordmark: { fontSize: 20, fontWeight: "800" },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  bodyStrong: { fontSize: 16, fontWeight: "600" },
  timeLg: { fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  timeMd: { fontSize: 17, fontWeight: "600", fontVariant: ["tabular-nums"] },
  caption: { fontSize: 13, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "600" },
} satisfies Record<string, TextStyle>;

/** §3.1 */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** §3.2 */
export const radius = { sm: 8, md: 14, lg: 20, full: 999 } as const;

/**
 * §3.3 fixa só a ordem (folha < cartão < toast); os números abaixo são uma escolha da implementação
 * (iOS: `shadow*`; Android: `elevation`).
 */
export const elevation = {
  sheet: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 4 },
  card: { shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
  toast: { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 16 },
} satisfies Record<string, ViewStyle>;

/** §4. Curva: ease-out na entrada, ease-in na saída (padrão do sistema). */
export const motion = { fast: 150, normal: 250 } as const;

/** Altura mínima de alvo de toque (§5.12). */
export const minTouch = 44;
