/**
 * Provedor do nome do usuário na árvore de componentes (E-08.5 Bloco 15, D-203, D-204).
 * Fica exclusivamente no aparelho local e fora do backup.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { clearUserName, readUserName, writeUserName } from "../db/userName";
import { useNow } from "./NowProvider";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface UserNameContextValue {
  name: string | null;
  loaded: boolean;
  setName: (raw: string | null | undefined) => Promise<void>;
  clear: () => Promise<void>;
}

export const USER_NAME_CONTEXT_DEFAULT: UserNameContextValue = {
  name: null,
  loaded: true,
  setName: async () => {},
  clear: async () => {},
};

const UserNameContext = createContext<UserNameContextValue>(USER_NAME_CONTEXT_DEFAULT);

export async function loadUserNameState(
  db: AnyDb,
  onName: (name: string | null) => void,
  onLoaded: () => void,
): Promise<void> {
  try {
    const current = await readUserName(db);
    onName(current);
  } catch {
    // Ignora erro de leitura inicial
  } finally {
    onLoaded();
  }
}

export function UserNameProvider({
  db,
  children,
}: {
  db: AnyDb;
  children: ReactNode;
}) {
  const now = useNow();
  const nowRef = useRef(now);
  nowRef.current = now;
  const [name, setNameState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    await loadUserNameState(db, setNameState, () => setLoaded(true));
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setName = useCallback(
    async (raw: string | null | undefined) => {
      await writeUserName(db, raw, nowRef.current());
      await refresh();
    },
    [db, refresh],
  );

  const clear = useCallback(async () => {
    await clearUserName(db, nowRef.current());
    await refresh();
  }, [db, refresh]);

  const value = useMemo(
    () => ({
      name,
      loaded,
      setName,
      clear,
    }),
    [name, loaded, setName, clear],
  );

  return <UserNameContext.Provider value={value}>{children}</UserNameContext.Provider>;
}

export function useUserName(): UserNameContextValue {
  return useContext(UserNameContext);
}
