/** Carrega os horários uma vez, na abertura (como a lista de pontos), e os entrega à árvore de telas. */
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";

export type ScheduleState = { status: "loading" } | { status: "ready"; data: ScheduleSnapshot } | { status: "error" };

const ScheduleContext = createContext<ScheduleState>({ status: "loading" });

export function ScheduleProvider({ db, children }: { db: Parameters<typeof loadSchedule>[0]; children: ReactNode }) {
  const [state, setState] = useState<ScheduleState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadSchedule(db).then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [db]);
  return <ScheduleContext.Provider value={state}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleState {
  return useContext(ScheduleContext);
}
