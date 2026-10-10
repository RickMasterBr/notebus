/**
 * As preferências na árvore de telas (E-08 §3.1, §3.3, §3.4): margem, feriados municipais e o interruptor dos avisos.
 * A lógica está em `data/preferences.ts` (testada sem React); aqui ficam o estado lido do banco, o "agora" do
 * `NowProvider` e a ligação com a recarga dos horários e com o agendador dos avisos.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PREFERENCES, type Preferences } from "../db/preferences";
import { expoPort } from "../notifications/expoPort";
import { requestReschedule } from "../notifications/runtime";
import { useNow } from "./NowProvider";
import { type PreferencesStore, createPreferences } from "./preferences";
import { useRegistro } from "./RegistroProvider";
import { useScheduleReload } from "./ScheduleProvider";

interface PreferencesValue extends Preferences {
  /** `false` = valor recusado (fora de 0 a 10 ou não inteiro); nada foi gravado. */
  setMargin: (value: number) => Promise<boolean>;
  setIncludeMunicipalHolidays: (value: boolean) => Promise<void>;
  /** Ligar sem a permissão do sistema devolve `no_permission` e não liga. */
  setAlarmsAllowed: (value: boolean) => Promise<{ ok: true } | { ok: false; reason: "no_permission" }>;
}

const PreferencesContext = createContext<PreferencesValue>({
  ...DEFAULT_PREFERENCES,
  setMargin: async () => false,
  setIncludeMunicipalHolidays: async () => {},
  setAlarmsAllowed: async () => ({ ok: false, reason: "no_permission" }),
});

export function PreferencesProvider({ db, children }: { db: Parameters<typeof createPreferences>[0]["db"]; children: ReactNode }) {
  const now = useNow();
  const nowRef = useRef(now);
  nowRef.current = now;
  const { exclusive } = useRegistro();
  const reload = useScheduleReload();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  const store = useMemo<PreferencesStore>(
    () =>
      createPreferences({
        db,
        exclusive,
        reload,
        // Não espera: o reagendamento nunca atrasa o toque do usuário (E-06 §3.2).
        reschedule: async () => requestReschedule(),
        port: expoPort,
      }),
    [db, exclusive, reload],
  );

  const refresh = useCallback(() => store.read().then(setPrefs, () => undefined), [store]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<PreferencesValue>(
    () => ({
      ...prefs,
      setMargin: async (v) => {
        const ok = await store.setMargin(v, nowRef.current());
        await refresh();
        return ok;
      },
      setIncludeMunicipalHolidays: async (v) => {
        await store.setIncludeMunicipalHolidays(v, nowRef.current());
        await refresh();
      },
      setAlarmsAllowed: async (v) => {
        const result = await store.setAlarmsAllowed(v, nowRef.current());
        await refresh();
        return result;
      },
    }),
    [prefs, store, refresh],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}
