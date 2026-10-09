/**
 * Localização dos pontos em memória (E-07 §3.2): `useStopLocations()` entrega os pontos que têm coordenada e `reload()`
 * relê do banco depois de guardar ou apagar. Guardar, desfazer e dispensar a oferta passam por aqui (o banco é daqui).
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type StopPoint, clearStopLocation, saveStopLocation } from "../db/stopLocation";
import { useNow } from "./NowProvider";
import { type StopLocation, loadStopLocations } from "./stopLocations";
import { type DismissedMap, readDismissed, writeDismissed } from "./stopLocationOffer";

type Db = Parameters<typeof loadStopLocations>[0];

export interface StopLocationsValue {
  /** `loading` até a primeira leitura (um erro de leitura vira `ready` com a lista vazia). */
  status: "loading" | "ready";
  stops: readonly StopLocation[];
  dismissed: DismissedMap;
  reload: () => Promise<void>;
  save: (stopId: string, point: StopPoint) => Promise<void>;
  clear: (stopId: string) => Promise<void>;
  /** "Agora não": guarda o id do registro mais recente na hora. */
  dismiss: (stopId: string, newestRecordId: string) => Promise<void>;
}

const StopLocationsContext = createContext<StopLocationsValue>({
  status: "loading",
  stops: [],
  dismissed: {},
  reload: async () => {},
  save: async () => {},
  clear: async () => {},
  dismiss: async () => {},
});

export function StopLocationsProvider({ db, children }: { db: Db; children: ReactNode }) {
  const now = useNow();
  const [state, setState] = useState<{ status: "loading" | "ready"; stops: StopLocation[]; dismissed: DismissedMap }>({
    status: "loading",
    stops: [],
    dismissed: {},
  });
  const dismissedRef = useRef<DismissedMap>({});
  dismissedRef.current = state.dismissed;

  const reload = useCallback(async () => {
    try {
      const [stops, dismissed] = await Promise.all([loadStopLocations(db), readDismissed(db)]);
      setState({ status: "ready", stops, dismissed });
    } catch {
      setState((cur) => ({ ...cur, status: "ready" }));
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (stopId: string, point: StopPoint) => {
      await saveStopLocation(db, stopId, point, "suggested", now());
      await reload();
    },
    [db, now, reload],
  );
  const clear = useCallback(
    async (stopId: string) => {
      await clearStopLocation(db, stopId, now());
      await reload();
    },
    [db, now, reload],
  );
  const dismiss = useCallback(
    async (stopId: string, newestRecordId: string) => {
      const next = { ...dismissedRef.current, [stopId]: newestRecordId };
      setState((cur) => ({ ...cur, dismissed: next }));
      try {
        await writeDismissed(db, next, now());
      } catch {
        /* a dispensa vale nesta sessão; na próxima abertura a oferta pode voltar */
      }
    },
    [db, now],
  );

  const value = useMemo(() => ({ ...state, reload, save, clear, dismiss }), [state, reload, save, clear, dismiss]);
  return <StopLocationsContext.Provider value={value}>{children}</StopLocationsContext.Provider>;
}

export function useStopLocations(): StopLocationsValue {
  return useContext(StopLocationsContext);
}
