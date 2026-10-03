/** Abrir um ponto (toque num resultado da Busca ou num cartão): lembra como "último aberto" e empilha a folha de ponto. */
import { useCallback } from "react";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useSheets } from "./SheetsContext";

export function useOpenStop(): (stop: { id: string; name: string }) => void {
  const { dispatch } = useSheets();
  const { remember } = useRecentStops();
  return useCallback(
    (stop) => {
      remember(stop.id);
      dispatch({ type: "push", sheet: { kind: "stop", stopId: stop.id, name: stop.name } });
    },
    [dispatch, remember],
  );
}
