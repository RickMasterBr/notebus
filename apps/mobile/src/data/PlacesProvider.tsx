/**
 * Provedor de Lugares, Trajetos, Opções e Tempos a Pé na árvore de telas (E-05 Bloco 2).
 *
 * Expõe o estado carregado do banco e ações com recarga reativa e respeito ao relógio injetável.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { useNow } from "./NowProvider";
import {
  type AddOptionInput,
  type CreatePlaceInput,
  type OptionRow,
  type OptionToken,
  type PlaceRow,
  type RouteRow,
  type SetWalkTimeInput,
  type UpdateOptionPatch,
  type UpdatePlacePatch,
  type WalkTimeRow,
  createPlaces,
} from "../db/places";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface PlacesContextValue {
  status: "loading" | "ready";
  places: readonly PlaceRow[];
  shortcuts: readonly PlaceRow[];
  routes: readonly RouteRow[];
  options: readonly OptionRow[];
  walkTimes: readonly WalkTimeRow[];
  createPlace: (input: CreatePlaceInput) => Promise<PlaceRow>;
  updatePlace: (id: string, patch: UpdatePlacePatch) => Promise<PlaceRow>;
  reorderShortcuts: (placeIds: string[]) => Promise<void>;
  ensureRoute: (originPlaceId: string, destinationPlaceId: string) => Promise<RouteRow>;
  setWalkTime: (stopId: string, placeId: string, input: SetWalkTimeInput) => Promise<WalkTimeRow>;
  getWalkTime: (stopId: string, placeId: string) => WalkTimeRow | null;
  addOption: (input: AddOptionInput) => Promise<OptionRow>;
  updateOption: (id: string, patch: UpdateOptionPatch) => Promise<OptionRow>;
  removeOption: (id: string) => Promise<{ token: OptionToken }>;
  restoreOption: (token: OptionToken) => Promise<void>;
  reload: () => Promise<void>;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ db, children }: { db: AnyDb; children: ReactNode }) {
  const now = useNow();
  const placesRepo = useMemo(() => createPlaces(db), [db]);

  const [state, setState] = useState<{
    status: "loading" | "ready";
    places: PlaceRow[];
    routes: RouteRow[];
    options: OptionRow[];
    walkTimes: WalkTimeRow[];
  }>({
    status: "loading",
    places: [],
    routes: [],
    options: [],
    walkTimes: [],
  });

  const reload = useCallback(async () => {
    try {
      const data = await placesRepo.loadAll();
      setState({
        status: "ready",
        places: data.places,
        routes: data.routes,
        options: data.options,
        walkTimes: data.walkTimes,
      });
    } catch {
      setState((cur) => ({ ...cur, status: "ready" }));
    }
  }, [placesRepo]);

  useEffect(() => {
    let alive = true;
    placesRepo.loadAll().then(
      (data) => {
        if (!alive) return;
        setState({
          status: "ready",
          places: data.places,
          routes: data.routes,
          options: data.options,
          walkTimes: data.walkTimes,
        });
      },
      () => {
        if (!alive) return;
        setState((cur) => ({ ...cur, status: "ready" }));
      },
    );
    return () => {
      alive = false;
    };
  }, [placesRepo]);

  const handleCreatePlace = useCallback(
    async (input: CreatePlaceInput) => {
      const p = await placesRepo.createPlace(input, now());
      await reload();
      return p;
    },
    [placesRepo, now, reload],
  );

  const handleUpdatePlace = useCallback(
    async (id: string, patch: UpdatePlacePatch) => {
      const p = await placesRepo.updatePlace(id, patch, now());
      await reload();
      return p;
    },
    [placesRepo, now, reload],
  );

  const handleReorderShortcuts = useCallback(
    async (placeIds: string[]) => {
      await placesRepo.reorderShortcuts(placeIds, now());
      await reload();
    },
    [placesRepo, now, reload],
  );

  const handleEnsureRoute = useCallback(
    async (originPlaceId: string, destinationPlaceId: string) => {
      const r = await placesRepo.ensureRoute(originPlaceId, destinationPlaceId, now());
      await reload();
      return r;
    },
    [placesRepo, now, reload],
  );

  const handleSetWalkTime = useCallback(
    async (stopId: string, placeId: string, input: SetWalkTimeInput) => {
      const wt = await placesRepo.setWalkTime(stopId, placeId, input, now());
      await reload();
      return wt;
    },
    [placesRepo, now, reload],
  );

  const getWalkTime = useCallback(
    (stopId: string, placeId: string): WalkTimeRow | null => {
      return (
        state.walkTimes.find(
          (w) => w.stopId === stopId && w.placeId === placeId && w.deletedAt === null,
        ) ?? null
      );
    },
    [state.walkTimes],
  );

  const handleAddOption = useCallback(
    async (input: AddOptionInput) => {
      const o = await placesRepo.addOption(input, now());
      await reload();
      return o;
    },
    [placesRepo, now, reload],
  );

  const handleUpdateOption = useCallback(
    async (id: string, patch: UpdateOptionPatch) => {
      const o = await placesRepo.updateOption(id, patch, now());
      await reload();
      return o;
    },
    [placesRepo, now, reload],
  );

  const handleRemoveOption = useCallback(
    async (id: string) => {
      const res = await placesRepo.removeOption(id, now());
      await reload();
      return res;
    },
    [placesRepo, now, reload],
  );

  const handleRestoreOption = useCallback(
    async (token: OptionToken) => {
      await placesRepo.restoreOption(token, now());
      await reload();
    },
    [placesRepo, now, reload],
  );

  const shortcuts = useMemo(
    () =>
      state.places
        .filter((p) => p.isShortcut && p.deletedAt === null)
        .sort((a, b) => (a.shortcutOrder ?? 0) - (b.shortcutOrder ?? 0)),
    [state.places],
  );

  const value = useMemo<PlacesContextValue>(
    () => ({
      status: state.status,
      places: state.places,
      shortcuts,
      routes: state.routes,
      options: state.options,
      walkTimes: state.walkTimes,
      createPlace: handleCreatePlace,
      updatePlace: handleUpdatePlace,
      reorderShortcuts: handleReorderShortcuts,
      ensureRoute: handleEnsureRoute,
      setWalkTime: handleSetWalkTime,
      getWalkTime,
      addOption: handleAddOption,
      updateOption: handleUpdateOption,
      removeOption: handleRemoveOption,
      restoreOption: handleRestoreOption,
      reload,
    }),
    [
      state.status,
      state.places,
      shortcuts,
      state.routes,
      state.options,
      state.walkTimes,
      handleCreatePlace,
      handleUpdatePlace,
      handleReorderShortcuts,
      handleEnsureRoute,
      handleSetWalkTime,
      getWalkTime,
      handleAddOption,
      handleUpdateOption,
      handleRemoveOption,
      handleRestoreOption,
      reload,
    ],
  );

  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces(): PlacesContextValue {
  const ctx = useContext(PlacesContext);
  if (!ctx) throw new Error("usePlaces fora de PlacesProvider");
  return ctx;
}
