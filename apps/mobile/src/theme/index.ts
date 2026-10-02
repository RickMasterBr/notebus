import { useColorScheme } from "react-native";
import { type ColorTokens, colors } from "./tokens";

export * from "./tokens";

export type ThemeName = "light" | "dark";

/** Escolhe o tema pelo modo do sistema (`useColorScheme`); sem informação, claro. */
export function useTheme(): { name: ThemeName; colors: ColorTokens } {
  const name: ThemeName = useColorScheme() === "dark" ? "dark" : "light";
  return { name, colors: colors[name] };
}
