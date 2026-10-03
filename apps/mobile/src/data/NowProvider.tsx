/** Entrega "agora" ao app (E-02 §4.5). Sem `source`, usa o relógio real. Use `useNow()` em vez de `Date.now()`. */
import { type ReactNode, createContext, useContext } from "react";
import { type NowSource, realNow } from "./clock";

const NowContext = createContext<NowSource>(realNow);

export function NowProvider({ source = realNow, children }: { source?: NowSource; children: ReactNode }) {
  return <NowContext.Provider value={source}>{children}</NowContext.Provider>;
}

/** Devolve a função que dá o instante atual (ms). Chame-a quando precisar do valor; ela não re-renderiza sozinha. */
export function useNow(): NowSource {
  return useContext(NowContext);
}
