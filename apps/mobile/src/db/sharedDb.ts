/**
 * O banco que o `App` abriu, num ponto único (E-06 §4.2): o tratador dos botões do aviso usa este se existir; senão abre o
 * seu próprio, sem migração (`openExistingNotebusDb` em `open.ts`).
 */
type Db = Awaited<ReturnType<typeof import("./open").openNotebusDb>>["db"];

let shared: Db | null = null;

export const setSharedDb = (db: Db | null): void => {
  shared = db;
};

export const getSharedDb = (): Db | null => shared;
