/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { useNow } from "../data/NowProvider";
import { recordOpenRequest } from "./diagScroll";
import { type Dispatch, type ReactNode, createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { type SheetAction, type SheetStackState, initialSheetState, sheetReducer } from "./stack";

interface SheetsValue {
  state: SheetStackState;
  dispatch: Dispatch<SheetAction>;
}

const SheetsContext = createContext<SheetsValue | null>(null);

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(sheetReducer, initialSheetState);
  const now = useNow();
  // DIAG (bloco 5e): anota o último pedido de abertura. Sai junto com o painel.
  const dispatch = useCallback<Dispatch<SheetAction>>(
    (action) => {
      if (action.type === "push") recordOpenRequest(action.sheet.kind, now());
      rawDispatch(action);
    },
    [now],
  );
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSheets fora do SheetsProvider");
  return value;
}
