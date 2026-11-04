/** Estado da pilha de folhas para a árvore de componentes. A lógica está em `stack.ts` (testada no Node). */
import { useNow } from "../data/NowProvider";
import { notifyPendingIntent, onPendingIntent, peekPendingIntent, takePendingIntent } from "../notifications/pendingIntent";
import { DIAG_SCROLL, recordCloseRequest, recordDiagEvent, recordOpenRequest } from "./diagScroll";
import { StackActions } from "@react-navigation/native";
import { type Dispatch, type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { navigationRef, openScreenEntries, registerScreenEntry, screenIdsOf } from "../nav/screenEntries";
import { routeAction } from "../nav/routeAction";
import { type SheetAction, type SheetContent, type SheetEntry, type SheetStackState, initialSheetState, sheetReducer } from "./stack";

interface SheetsValue {
  /** Folhas seguidas das telas abertas (para o "sou a do topo?"). */
  state: SheetStackState;
  /** Só a pilha de folhas. */
  sheetState: SheetStackState;
  dispatch: Dispatch<SheetAction>;
  /** Pede à folha do Início (HomeSheet) para recolher ao detent pequeno (D-145, D-180). */
  collapseHome: () => void;
  /** Registra a função de recolhimento da HomeSheet quando ela está montada. */
  registerHomeCollapse: (callback: () => void) => () => void;
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
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = useCallback<Dispatch<SheetAction>>((action) => {
    // Só com o painel de diagnóstico ligado (`DIAG_SCROLL`): anota abertura e fechamento.
    if (DIAG_SCROLL) {
      const nextState = sheetReducer(stateRef.current, action);
      const before = stateRef.current.stack.map((e) => `${e.kind}#${e.id}`).join(" > ");
      const after = nextState.stack.map((e) => `${e.kind}#${e.id}`).join(" > ");
      recordDiagEvent(`pilha ${action.type} [${before}] → [${after}]`);
    }
    if (DIAG_SCROLL && action.type === "push") recordOpenRequest(action.sheet.kind, nowRef.current());
    if (DIAG_SCROLL && action.type === "close") {
      const closing = stateRef.current.stack.find((e) => e.id === action.id);
      recordCloseRequest(action.id, closing ? closing.kind : "desconhecido");
    }
    if (DIAG_SCROLL && action.type === "close") {
      const top = stateRef.current.stack[stateRef.current.stack.length - 1];
      if (top && action.id !== top.id) {
        const target = stateRef.current.stack.find((e) => e.id === action.id);
        const targetKind = target ? target.kind : "desconhecido";
        recordDiagEvent(`fechar ignorado ${targetKind}#${action.id} (topo=${top.kind}#${top.id})`);
      }
    }

    if (DIAG_SCROLL && action.type === "replace") {
      const top = stateRef.current.stack[stateRef.current.stack.length - 1];
      const oldKind = top ? top.kind : "desconhecido";
      recordDiagEvent(`trocar ${oldKind} > ${action.sheet.kind}`);
    }
    const routed = routeAction(action, { screenIds: screenIdsOf(navigationRef.isReady() ? navigationRef.getRootState() : undefined) });
    if (routed.to === "nav") {
      if (!navigationRef.isReady()) return;
      if (routed.op === "push") navigationRef.dispatch(StackActions.push("tela", { id: registerScreenEntry(routed.sheet).id }));
      else if (routed.op === "replace") navigationRef.dispatch(StackActions.replace("tela", { id: registerScreenEntry(routed.sheet).id }));
      else if (routed.op === "goBack") navigationRef.goBack();
      else if (routed.op === "popToTopThenSheets") navigationRef.dispatch(StackActions.popToTop());
      if (routed.op !== "popToTopThenSheets") return;
    }
    rawDispatch(action);
  }, []);

  // As telas abertas vêm do estado da navegação; o ouvinte é guardado pelo `navigationRef` até o container montar.
  const [screens, setScreens] = useState<readonly SheetEntry[]>([]);
  useEffect(
    () =>
      navigationRef.addListener("state", () => {
        const next = openScreenEntries(navigationRef.getRootState());
        setScreens((prev) => (prev.length === next.length && prev.every((e, i) => e === next[i]) ? prev : next));
      }),
    [],
  );
  const fullState = useMemo(() => (screens.length ? { ...state, stack: [...state.stack, ...screens] } : state), [state, screens]);

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

  // Callback para recolher a HomeSheet ao detent pequeno (D-145, D-180)
  const homeCollapseRef = useRef<(() => void) | null>(null);
  const registerHomeCollapse = useCallback((callback: () => void) => {
    homeCollapseRef.current = callback;
    return () => {
      if (homeCollapseRef.current === callback) {
        homeCollapseRef.current = null;
      }
    };
  }, []);
  const collapseHome = useCallback(() => {
    homeCollapseRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ state: fullState, sheetState: state, dispatch, collapseHome, registerHomeCollapse }),
    [fullState, state, dispatch, collapseHome, registerHomeCollapse],
  );
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
