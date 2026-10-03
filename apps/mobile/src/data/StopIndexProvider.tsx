/** Carrega o índice de pontos uma vez, na abertura (E-02 §4.1), e o entrega à árvore de telas. */
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { type StopEntry, loadStopIndex } from "./stopIndex";

export type StopIndexState = { status: "loading" } | { status: "ready"; stops: StopEntry[] } | { status: "error" };

const StopIndexContext = createContext<StopIndexState>({ status: "loading" });

export function StopIndexProvider({ db, children }: { db: Parameters<typeof loadStopIndex>[0]; children: ReactNode }) {
  const [state, setState] = useState<StopIndexState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadStopIndex(db).then(
      (stops) => alive && setState({ status: "ready", stops }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [db]);
  return <StopIndexContext.Provider value={state}>{children}</StopIndexContext.Provider>;
}

export function useStopIndex(): StopIndexState {
  return useContext(StopIndexContext);
}
