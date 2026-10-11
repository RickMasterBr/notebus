/**
 * O horário declarado na árvore de telas (E-08 §4, TL-07). A lógica está em `db/declaredTimes.ts` (testada sem React);
 * aqui ficam só as ligações, as mesmas do `CalendarEditsProvider`: a fila do registro, a recarga dos horários, o recasamento
 * dos registros (com a rede nova) e o reagendamento dos avisos.
 */
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { type DeclaredTimes, createDeclaredTimes } from "../db/declaredTimes";
import { requestReschedule } from "../notifications/runtime";
import { matchNetworkOf } from "./records";
import { useRegistro } from "./RegistroProvider";
import { type ScheduleSnapshot } from "./schedule";
import { useScheduleReload } from "./ScheduleProvider";

type Declared = DeclaredTimes<ScheduleSnapshot>;

const DeclaredTimesContext = createContext<Declared | null>(null);

export function DeclaredTimesProvider({ db, children }: { db: Parameters<typeof createDeclaredTimes>[0]["db"]; children: ReactNode }) {
  const reload = useScheduleReload();
  const { exclusive, rematchWhere } = useRegistro();

  const declared = useMemo<Declared>(
    () =>
      createDeclaredTimes<ScheduleSnapshot>({
        db,
        exclusive,
        reload,
        rematch: (changed, fresh, nowMs) => rematchWhere(changed, matchNetworkOf(fresh), nowMs),
        // Não espera: o reagendamento nunca atrasa o toque do usuário (E-06 §3.2).
        reschedule: async () => requestReschedule(),
      }),
    [db, exclusive, reload, rematchWhere],
  );
  return <DeclaredTimesContext.Provider value={declared}>{children}</DeclaredTimesContext.Provider>;
}

/** `declare(input, nowMs)`: grava o plano do domínio e devolve o `undo`. */
export function useDeclaredTimes(): Declared {
  const declared = useContext(DeclaredTimesContext);
  if (!declared) throw new Error("useDeclaredTimes fora do DeclaredTimesProvider");
  return declared;
}
