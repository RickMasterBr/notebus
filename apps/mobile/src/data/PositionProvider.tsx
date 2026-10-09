/**
 * Provedor da última posição conhecida (E-07 §3.3, D-108). `useLastFix()` devolve o valor em memória, na hora.
 * Aquece uma vez quando o app vem para a frente (inclusive na abertura), só com a permissão já concedida.
 * A permissão não é pedida aqui: só no primeiro toque em Registrar (`usePositionStore().askOnce()`).
 */
import type { PositionFix } from "@notebus/domain";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { createExpoPositionPort } from "./devicePosition";
import { type PositionStore, createPositionStore } from "./positionStore";

const inertStore = createPositionStore({ permission: async () => "denied", request: async () => "denied", read: async () => null });
const PositionContext = createContext<PositionStore>(inertStore);

export function PositionProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createPositionStore(createExpoPositionPort()), []);
  useEffect(() => {
    void store.warm();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void store.warm();
    });
    return () => sub.remove();
  }, [store]);
  return <PositionContext.Provider value={store}>{children}</PositionContext.Provider>;
}

export function usePositionStore(): PositionStore {
  return useContext(PositionContext);
}

/** A última posição conhecida (ou `null`), sem esperar nada. A idade é conferida por quem usa. */
export function useLastFix(): PositionFix | null {
  const store = usePositionStore();
  return useSyncExternalStore(store.subscribe, store.getFix);
}

/** O estado atual da permissão de localização. */
export function usePositionPermission() {
  const store = usePositionStore();
  return useSyncExternalStore(store.subscribe, store.getPermission);
}
