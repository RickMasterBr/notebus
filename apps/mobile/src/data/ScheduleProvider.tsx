/** Carrega os horários na abertura (como a lista de pontos) e os entrega à árvore de telas. Recarrega quando o calendário ou as preferências mudam. */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";

export type ScheduleState = { status: "loading" } | { status: "ready"; data: ScheduleSnapshot } | { status: "error" };

/** Lê os horários de novo e devolve o que leu (`null` se falhou: o que já estava na tela fica). */
export type ScheduleReload = () => Promise<ScheduleSnapshot | null>;

const ScheduleContext = createContext<ScheduleState>({ status: "loading" });
const ReloadContext = createContext<ScheduleReload>(async () => null);

export function ScheduleProvider({ db, children }: { db: Parameters<typeof loadSchedule>[0]; children: ReactNode }) {
  const [state, setState] = useState<ScheduleState>({ status: "loading" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    loadSchedule(db).then(
      (data) => alive.current && setState({ status: "ready", data }),
      () => alive.current && setState({ status: "error" }),
    );
    return () => {
      alive.current = false;
    };
  }, [db]);

  // E-08: cadastrar um feriado ou uma exceção, ou mudar a margem, não esperam a próxima abertura do app.
  const reload = useCallback<ScheduleReload>(async () => {
    try {
      const data = await loadSchedule(db);
      if (alive.current) setState({ status: "ready", data });
      return data;
    } catch {
      return null;
    }
  }, [db]);
  const value = useMemo(() => state, [state]);
  return (
    <ReloadContext.Provider value={reload}>
      <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
    </ReloadContext.Provider>
  );
}

export function useSchedule(): ScheduleState {
  return useContext(ScheduleContext);
}

/** Recarga dos horários, sem mudar o que `useSchedule()` devolve (E-08). */
export function useScheduleReload(): ScheduleReload {
  return useContext(ReloadContext);
}
