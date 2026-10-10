/**
 * As exceções de data e os feriados do usuário na árvore de telas (E-08 §3.3, UC-13). A lógica está em
 * `db/calendarEdits.ts` (testada sem React); aqui ficam as ligações: o calendário carregado, a recarga dos horários, o
 * recasamento dos registros (com a rede nova) e o reagendamento dos avisos. As telas e os toasts são do bloco 1b.
 */
import { type ReactNode, createContext, useContext, useMemo, useRef } from "react";
import { type CalendarEdits, createCalendarEdits } from "../db/calendarEdits";
import { requestReschedule } from "../notifications/runtime";
import { matchNetworkOf } from "./records";
import { useRegistro } from "./RegistroProvider";
import { type ScheduleSnapshot } from "./schedule";
import { useSchedule, useScheduleReload } from "./ScheduleProvider";

type Edits = CalendarEdits<ScheduleSnapshot>;

const CalendarEditsContext = createContext<Edits | null>(null);

export function CalendarEditsProvider({ db, children }: { db: Parameters<typeof createCalendarEdits>[0]["db"]; children: ReactNode }) {
  const schedule = useSchedule();
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const reload = useScheduleReload();
  const { exclusive, rematchWhere } = useRegistro();

  const edits = useMemo<Edits>(
    () =>
      createCalendarEdits<ScheduleSnapshot>({
        db,
        exclusive,
        calendar: () => (scheduleRef.current.status === "ready" ? scheduleRef.current.data.calendar : { overrides: [], holidays: [] }),
        reload,
        rematch: (changed, fresh, nowMs) => rematchWhere(changed, matchNetworkOf(fresh), nowMs),
        // Não espera: o reagendamento nunca atrasa o toque do usuário (E-06 §3.2).
        reschedule: async () => requestReschedule(),
      }),
    [db, exclusive, reload, rematchWhere],
  );
  return <CalendarEditsContext.Provider value={edits}>{children}</CalendarEditsContext.Provider>;
}

/** `saveOverride`, `deleteOverride`, `saveHoliday` e `deleteHoliday`; cada um recebe `nowMs` (o "agora" do `NowProvider`). */
export function useCalendarEdits(): Edits {
  const edits = useContext(CalendarEditsContext);
  if (!edits) throw new Error("useCalendarEdits fora do CalendarEditsProvider");
  return edits;
}
