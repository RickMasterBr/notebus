/**
 * Últimos pontos abertos em memória + gravação em `setting` (E-02 bloco 3c). Abrir um ponto, pela Busca ou por um
 * cartão, chama `remember`: a lista muda na hora e a gravação segue em fila (duas aberturas seguidas não se perdem).
 * Falha ao gravar não atrapalha: a lista só volta a ser a de antes na próxima abertura do app.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "./NowProvider";
import { pushRecent, readRecentStops, rememberStop, writeRecentStops } from "./recentStops";

type Db = Parameters<typeof readRecentStops>[0];

export interface RecentStopsValue {
  /** `loading` até a primeira leitura do banco. */
  status: "loading" | "ready";
  /** IDs dos pontos, o mais recente primeiro. */
  ids: string[];
  remember: (stopId: string) => void;
  /** "Limpar recentes" (D-143): esvazia a lista; a de antes volta por `restore` (o Desfazer do toast). */
  clear: () => string[];
  restore: (ids: readonly string[]) => void;
}

const RecentStopsContext = createContext<RecentStopsValue>({
  status: "loading",
  ids: [],
  remember: () => {},
  clear: () => [],
  restore: () => {},
});

export function RecentStopsProvider({ db, children }: { db: Db; children: ReactNode }) {
  const now = useNow();
  const [state, setState] = useState<{ status: "loading" | "ready"; ids: string[] }>({ status: "loading", ids: [] });
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    readRecentStops(db).then(
      (ids) => alive && setState((cur) => ({ status: "ready", ids: cur.ids.length > 0 ? cur.ids : ids })),
      () => alive && setState((cur) => ({ ...cur, status: "ready" })),
    );
    return () => {
      alive = false;
    };
  }, [db]);

  const remember = useCallback(
    (stopId: string) => {
      setState((cur) => ({ ...cur, ids: pushRecent(cur.ids, stopId) }));
      queue.current = queue.current.then(() => rememberStop(db, stopId, now())).catch(() => undefined);
    },
    [db, now],
  );

  // `clear` e `restore` entram na mesma fila de gravação do `remember`: nada se perde nem se embaralha.
  const idsRef = useRef<string[]>([]);
  idsRef.current = state.ids;
  const replaceAll = useCallback(
    (ids: readonly string[]) => {
      setState((cur) => ({ ...cur, ids: [...ids] }));
      queue.current = queue.current.then(() => writeRecentStops(db, ids, now())).catch(() => undefined);
    },
    [db, now],
  );
  const clear = useCallback(() => {
    const before = idsRef.current;
    replaceAll([]);
    return before;
  }, [replaceAll]);

  const value = useMemo(() => ({ ...state, remember, clear, restore: replaceAll }), [state, remember, clear, replaceAll]);
  return <RecentStopsContext.Provider value={value}>{children}</RecentStopsContext.Provider>;
}

export function useRecentStops(): RecentStopsValue {
  return useContext(RecentStopsContext);
}
