/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { type Dispatch, type ReactNode, createContext, useContext, useMemo, useReducer } from "react";
import { type SheetAction, type SheetStackState, initialSheetState, sheetReducer } from "./stack";

interface SheetsValue {
  state: SheetStackState;
  dispatch: Dispatch<SheetAction>;
}

const SheetsContext = createContext<SheetsValue | null>(null);

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sheetReducer, initialSheetState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSheets fora do SheetsProvider");
  return value;
}
