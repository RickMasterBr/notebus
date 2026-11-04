/** Contexto da entrada de tela: `null` fora de tela (folha comum). */
import { createContext, useContext } from "react";
import type { SheetEntry } from "../sheets/stack";

export const ScreenContext = createContext<SheetEntry | null>(null);

export function useScreenEntry(): SheetEntry | null {
  return useContext(ScreenContext);
}
