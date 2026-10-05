/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { useNow } from "../data/NowProvider";
import { DIAG_SCROLL, recordOpenRequest } from "./diagScroll";
import { type Dispatch, type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { type SheetAction, type SheetContent, type SheetStackState, initialSheetState, sheetReducer } from "./stack";

interface SheetsValue {
  state: SheetStackState;
  dispatch: Dispatch<SheetAction>;
}

/** Quem pediu a escolha de um ponto (a folha Registrar, ao tocar em "Trocar"); a Busca em modo `pick` chama de volta. */
export type StopPick = (stop: { id: string; name: string }) => void;
interface StopPickValue {
  /** A folha que pede grava aqui o que fazer com o ponto escolhido, antes de empilhar a Busca. */
  request: (callback: StopPick) => void;
  /** A Busca entrega o ponto escolhido. */
  resolve: StopPick;
}
const StopPickContext = createContext<StopPickValue | null>(null);

const SheetsContext = createContext<SheetsValue | null>(null);

let sheetOpener: ((sheet: SheetContent) => void) | null = null;

export function openRecordSheet(observationId: string): void {
  sheetOpener?.({ kind: "record", observationId });
}

export function openVerifySheet(observationId: string): void {
  sheetOpener?.({ kind: "verify", observationId });
}

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

  useEffect(() => {
    sheetOpener = (sheet) => dispatch({ type: "push", sheet });
    return () => {
      sheetOpener = null;
    };
  }, [dispatch]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  const pick = useRef<StopPick | null>(null);
  const stopPick = useMemo<StopPickValue>(
    () => ({
      request: (callback) => {
        pick.current = callback;
      },
      resolve: (stop) => {
        const callback = pick.current;
        pick.current = null;
        callback?.(stop);
      },
    }),
    [],
  );
  return (
    <SheetsContext.Provider value={value}>
      <StopPickContext.Provider value={stopPick}>{children}</StopPickContext.Provider>
    </SheetsContext.Provider>
  );
}

export function useStopPick(): StopPickValue {
  const value = useContext(StopPickContext);
  if (!value) throw new Error("useStopPick fora do SheetsProvider");
  return value;
}

export function useSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSheets fora do SheetsProvider");
  return value;
}
