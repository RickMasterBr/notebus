/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { useNow } from "../data/NowProvider";
import { notifyPendingIntent, onPendingIntent, peekPendingIntent, takePendingIntent } from "../notifications/pendingIntent";
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

export type AlightPick = (alight: { patternStopId: string; stopId: string; position: number }) => void;
interface AlightPickValue {
  /** A folha que pede grava aqui o que fazer com a descida escolhida, antes de empilhar AlightPicker. */
  request: (callback: AlightPick) => void;
  /** O seletor de descida entrega a descida escolhida. */
  resolve: AlightPick;
}
const AlightPickContext = createContext<AlightPickValue | null>(null);

const SheetsContext = createContext<SheetsValue | null>(null);

let sheetOpener: ((sheet: SheetContent) => void) | null = null;

/** As folhas já estão montadas? */
export const sheetsAvailable = (): boolean => sheetOpener !== null;

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
    notifyPendingIntent(); // quem esperava as folhas (o "Ajustar" do aviso, E-06 §5.3) tenta de novo
    return () => {
      sheetOpener = null;
    };
  }, [dispatch]);

  // Consumo do pendingIntent goto (E-06 Bloco 3, Item 2): corpo do aviso abre a tela "Ir para" do destino
  useEffect(() => {
    const consume = () => {
      const intent = peekPendingIntent();
      if (intent?.kind !== "goto") return;
      takePendingIntent();
      dispatch({ type: "push", sheet: { kind: "goto", destinationPlaceId: intent.placeId } });
    };
    consume();
    return onPendingIntent(consume);
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

  const alightCallbackRef = useRef<AlightPick | null>(null);
  const alightPick = useMemo<AlightPickValue>(
    () => ({
      request: (callback) => {
        alightCallbackRef.current = callback;
      },
      resolve: (alight) => {
        const callback = alightCallbackRef.current;
        alightCallbackRef.current = null;
        callback?.(alight);
      },
    }),
    [],
  );

  return (
    <SheetsContext.Provider value={value}>
      <StopPickContext.Provider value={stopPick}>
        <AlightPickContext.Provider value={alightPick}>{children}</AlightPickContext.Provider>
      </StopPickContext.Provider>
    </SheetsContext.Provider>
  );
}

export function useStopPick(): StopPickValue {
  const value = useContext(StopPickContext);
  if (!value) throw new Error("useStopPick fora do SheetsProvider");
  return value;
}

export function useAlightPick(): AlightPickValue {
  const value = useContext(AlightPickContext);
  if (!value) throw new Error("useAlightPick fora do SheetsProvider");
  return value;
}

export function useSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSheets fora do SheetsProvider");
  return value;
}
