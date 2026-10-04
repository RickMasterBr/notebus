/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { useNow } from "../data/NowProvider";
import { DIAG_SCROLL, recordOpenRequest } from "./diagScroll";
import { type Dispatch, type ReactNode, createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import { type SheetAction, type SheetStackState, initialSheetState, sheetReducer } from "./stack";

interface SheetsValue {
  state: SheetStackState;
  dispatch: Dispatch<SheetAction>;
}

const SheetsContext = createContext<SheetsValue | null>(null);

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(sheetReducer, initialSheetState);
  // `dispatch` tem identidade fixa: o "agora" muda quando o relógio de teste liga, troca ou desliga, e uma `dispatch` nova
  // a cada mudança refaria o `onClose` e o handle de toda folha aberta (a biblioteca remonta o handle).
  const now = useNow();
  const nowRef = useRef(now);
  nowRef.current = now;
  const dispatch = useCallback<Dispatch<SheetAction>>((action) => {
    // Só com o painel de diagnóstico ligado (`DIAG_SCROLL`): anota o último pedido de abertura.
    if (DIAG_SCROLL && action.type === "push") recordOpenRequest(action.sheet.kind, nowRef.current());
    rawDispatch(action);
  }, []);
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSheets fora do SheetsProvider");
  return value;
}
