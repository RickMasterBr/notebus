/**
 * Provedor do mapa offline (E-07 7b Bloco 6b).
 * Expõe o estado do download, oferta, tamanho estimado e ações de baixar/adiar/apagar.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { type GeoPoint, offlineRegion } from "@notebus/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { getSharedDb } from "../db/sharedDb";
import { readOfflineSnooze, writeOfflineSnooze } from "../db/appState";
import { t } from "../i18n";
import { useNow } from "./NowProvider";
import { usePlaces } from "./PlacesProvider";
import { useStopLocations } from "./StopLocationsProvider";
import { useToast } from "./ToastProvider";
import {
  estimateMegabytes,
  shouldOfferOfflineMap,
  type OfflineMapStatus,
} from "./mapOfflineState";
import {
  deleteOfflineMap,
  getOfflineMapStatus,
  startOfflineMapDownload,
} from "./mapOfflineNative";
import {
  applyOfflineSnooze,
  canStartOfflineDownload,
  reduceOfflineMap,
  type OfflineControllerState,
} from "./offlineMapController";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface OfflineMapContextValue {
  status: OfflineMapStatus;
  offerVisible: boolean;
  mapVisible: boolean;
  setMapVisible: (v: boolean) => void;
  estimatedMb: number;
  startDownload: () => void;
  snooze: () => void;
  deleteMap: () => void;
}

const OfflineMapContext = createContext<OfflineMapContextValue | null>(null);

const initialControllerState: OfflineControllerState = {
  status: { kind: "none" },
  mapVisible: false,
  snoozedUntilMs: null,
};

export function OfflineMapProvider({
  db,
  children,
}: {
  db?: AnyDb;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reduceOfflineMap, initialControllerState);
  const now = useNow();
  const toast = useToast();
  const places = usePlaces();
  const stopLocations = useStopLocations();

  // Lê o status atual dos pacotes nativos e a soneca gravada no banco na montagem
  useEffect(() => {
    let alive = true;
    void (async () => {
      const initialStatus = await getOfflineMapStatus();
      if (!alive) return;
      dispatch({ type: "status_loaded", status: initialStatus });

      const targetDb = db ?? getSharedDb();
      if (targetDb) {
        const snoozedUntilMs = await readOfflineSnooze(targetDb);
        if (alive && snoozedUntilMs !== null) {
          dispatch({ type: "snoozed", untilMs: snoozedUntilMs });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  // Pontos com localização + lugares com localização para cálculo da região de Leiria
  const extraPoints = useMemo<GeoPoint[]>(() => {
    const points: GeoPoint[] = [];
    for (const s of stopLocations.stops) {
      if (typeof s.lat === "number" && typeof s.lon === "number") {
        points.push({ lat: s.lat, lon: s.lon });
      }
    }
    if (places.status === "ready") {
      for (const p of places.places) {
        if (
          (p.deletedAt === null || p.deletedAt === undefined) &&
          typeof p.lat === "number" &&
          typeof p.lon === "number"
        ) {
          points.push({ lat: p.lat, lon: p.lon });
        }
      }
    }
    return points;
  }, [stopLocations.stops, places.status, places.places]);

  const region = useMemo(() => offlineRegion(extraPoints), [extraPoints]);
  const estimatedMb = useMemo(
    () => estimateMegabytes(region.tileCount),
    [region.tileCount],
  );

  const offerVisible = useMemo(() => {
    return shouldOfferOfflineMap({
      status: state.status,
      mapVisible: state.mapVisible,
      snoozedUntilMs: state.snoozedUntilMs,
      nowMs: now(),
    });
  }, [state.status, state.mapVisible, state.snoozedUntilMs, now]);

  const setMapVisible = useCallback((v: boolean) => {
    dispatch({ type: "map_visible_changed", mapVisible: v });
  }, []);

  const snooze = useCallback(async () => {
    const targetDb = db ?? getSharedDb();
    await applyOfflineSnooze(now(), {
      dispatch: (untilMs) => dispatch({ type: "snoozed", untilMs }),
      write: targetDb ? (until, n) => writeOfflineSnooze(targetDb, until, n) : null,
    });
  }, [now, db]);

  const startDownload = useCallback(async () => {
    if (!canStartOfflineDownload(state.status)) return;
    dispatch({ type: "download_started" });

    try {
      await startOfflineMapDownload(region, (downloadStatus) => {
        if (downloadStatus.kind === "downloading") {
          dispatch({ type: "download_progress", percent: downloadStatus.percent });
        } else if (downloadStatus.kind === "ready") {
          dispatch({ type: "download_completed", bytes: downloadStatus.bytes });
        } else if (downloadStatus.kind === "error") {
          dispatch({ type: "download_failed" });
        }
      });
      toast.show({ title: t("offline_map.ready_toast") });
      const refreshed = await getOfflineMapStatus();
      dispatch({ type: "status_loaded", status: refreshed });
    } catch {
      dispatch({ type: "download_failed" });
    }
  }, [state.status.kind, region, toast]);

  const deleteMap = useCallback(async () => {
    await deleteOfflineMap();
    const refreshed = await getOfflineMapStatus();
    dispatch({ type: "status_loaded", status: refreshed });
  }, []);

  const value = useMemo<OfflineMapContextValue>(
    () => ({
      status: state.status,
      offerVisible,
      mapVisible: state.mapVisible,
      setMapVisible,
      estimatedMb,
      startDownload,
      snooze,
      deleteMap,
    }),
    [
      state.status,
      offerVisible,
      state.mapVisible,
      setMapVisible,
      estimatedMb,
      startDownload,
      snooze,
      deleteMap,
    ],
  );

  return (
    <OfflineMapContext.Provider value={value}>
      {children}
    </OfflineMapContext.Provider>
  );
}

export function useOfflineMap(): OfflineMapContextValue {
  const ctx = useContext(OfflineMapContext);
  if (!ctx) {
    throw new Error("useOfflineMap deve ser usado dentro de OfflineMapProvider");
  }
  return ctx;
}
