/** Carrega o índice de pontos na abertura (E-02 §4.1) e permite recarregá-lo após edição (E-08 bloco 3). */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type StopEntry, loadStopIndex, shouldApplyReload } from "./stopIndex";

export type StopIndexState = { status: "loading" } | { status: "ready"; stops: StopEntry[] } | { status: "error" };

const StopIndexContext = createContext<StopIndexState>({ status: "loading" });
const ReloadStopIndexContext = createContext<() => Promise<void>>(async () => {});

export function StopIndexProvider({ db, children }: { db: Parameters<typeof loadStopIndex>[0]; children: ReactNode }) {
  const [state, setState] = useState<StopIndexState>({ status: "loading" });
  const seqRef = useRef(0);
  const appliedRef = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const stops = await loadStopIndex(db);
      if (shouldApplyReload(seq, appliedRef.current)) {
        appliedRef.current = seq;
        setState({ status: "ready", stops });
      }
    } catch {
      // Se a primeira leitura falhar, vai para erro; se for recarga posterior, mantém estado atual
      if (appliedRef.current === 0) {
        setState({ status: "error" });
      }
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <StopIndexContext.Provider value={state}>
      <ReloadStopIndexContext.Provider value={reload}>
        {children}
      </ReloadStopIndexContext.Provider>
    </StopIndexContext.Provider>
  );
}

export function useStopIndex(): StopIndexState {
  return useContext(StopIndexContext);
}

export function useReloadStopIndex(): () => Promise<void> {
  return useContext(ReloadStopIndexContext);
}
