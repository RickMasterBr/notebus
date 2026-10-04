/**
 * O registro na árvore de telas (E-03 bloco 2): lê os registros e as viagens do banco, mantém o cartão "Em viagem" e
 * entrega as ações (embarcar, descer, "Não embarquei", Dispensar) com o toast e o Desfazer de cada uma.
 *
 * O fato é gravado primeiro e o toast sai logo em seguida; a dedução roda depois (`refreshDeductions`) e nunca atrasa o
 * toque (§3.2). Na abertura do app, e depois de cada registro, a fila refaz o que ficou sem dedução. O `ride` que passou
 * do fim do percurso fecha sozinho ao abrir o app, ao voltar do segundo plano e a cada tique do relógio que o app já tem
 * (`useNowTick`); nenhum temporizador novo.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { type PassageRecord, lisbonWallClock } from "@notebus/domain";
import type { BoardChoice } from "./boardChoices";
import { useNow } from "./NowProvider";
import { useSchedule } from "./ScheduleProvider";
import { useToast } from "./ToastProvider";
import { type AlightToken, type BoardToken, type ObservationRow, type RideRow, createRegistro } from "./registro";
import { matchNetworkOf, passageRecords } from "./records";
import { type AlightRow, type TripCardModel, boardingOf, buildTripCard } from "./rideView";
import { clockText } from "./stopCard";
import { useNowTick } from "./useNowTick";
import { t } from "../i18n";

type Db = Parameters<typeof createRegistro>[0];

export interface RegistroValue {
  status: "loading" | "ready";
  observations: readonly ObservationRow[];
  /** Os registros aceitos, no formato da estatística (`expectedTime`). */
  records: readonly PassageRecord[];
  /** O cartão do `ride` aberto; `null` sem viagem em curso (ou com os horários ainda carregando). */
  tripCard: TripCardModel | null;
  /** Embarque na linha escolhida da folha Registrar. Devolve `true` se o fato foi gravado. */
  board: (stopId: string, choice: BoardChoice) => Promise<boolean>;
  /** "Desci aqui" numa paragem da lista. Devolve `true` se a descida foi gravada. */
  alight: (card: TripCardModel, row: AlightRow) => Promise<boolean>;
  notBoarded: (card: TripCardModel) => void;
  dismiss: (card: TripCardModel) => void;
}

const nothing = async () => false;
const RegistroContext = createContext<RegistroValue>({
  status: "loading",
  observations: [],
  records: [],
  tripCard: null,
  board: nothing,
  alight: nothing,
  notBoarded: () => {},
  dismiss: () => {},
});

const hhmm = (at: number) => clockText(lisbonWallClock(at).minute);

export function RegistroProvider({ db, children }: { db: Db; children: ReactNode }) {
  const schedule = useSchedule();
  const now = useNow();
  const instant = useNowTick();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "ready"; observations: ObservationRow[]; rides: RideRow[] }>({
    status: "loading",
    observations: [],
    rides: [],
  });

  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const nowRef = useRef(now);
  nowRef.current = now;

  const registro = useMemo(
    () =>
      createRegistro(db, {
        network: () => (scheduleRef.current.status === "ready" ? matchNetworkOf(scheduleRef.current.data) : null),
        snapshot: () => (scheduleRef.current.status === "ready" ? scheduleRef.current.data : null),
      }),
    [db],
  );

  const reload = useCallback(async () => {
    try {
      const loaded = await registro.load();
      setState({ status: "ready", ...loaded });
    } catch {
      setState((cur) => ({ ...cur, status: "ready" }));
    }
  }, [registro]);

  /** Depois de gravar o fato: mostra o que há, refaz a fila da dedução e mostra de novo. Nada disso bloqueia o toque. */
  const settle = useCallback(async () => {
    try {
      await reload();
      await registro.refreshDeductions(nowRef.current());
      await reload();
    } catch {
      // O fato está salvo; a próxima abertura do app refaz a dedução.
    }
  }, [registro, reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const scheduleReady = schedule.status === "ready";
  // Abertura do app (com os horários prontos): refaz o que ficou sem dedução e fecha a viagem que já passou do fim.
  useEffect(() => {
    if (!scheduleReady) return;
    void (async () => {
      try {
        await registro.refreshDeductions(nowRef.current());
        await registro.expire(nowRef.current());
      } catch {
        // idem
      }
      await reload();
    })();
  }, [scheduleReady, registro, reload]);

  const hasOpenRide = state.rides.some((r) => r.status === "open");
  const expire = useCallback(async () => {
    try {
      if ((await registro.expire(nowRef.current())) > 0) await reload();
    } catch {
      // fecha na próxima
    }
  }, [registro, reload]);
  // Tique do relógio (o `useNowTick` já existe) e volta do segundo plano.
  useEffect(() => {
    if (scheduleReady && hasOpenRide) void expire();
  }, [instant, scheduleReady, hasOpenRide, expire]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && scheduleReady) void expire();
    });
    return () => sub.remove();
  }, [scheduleReady, expire]);

  const data = schedule.status === "ready" ? schedule.data : null;
  const records = useMemo(() => (data ? passageRecords(state.observations, data) : []), [data, state.observations]);

  const tripCard = useMemo(() => {
    if (!data) return null;
    const open = state.rides.filter((r) => r.status === "open").sort((a, b) => b.createdAt - a.createdAt)[0];
    const boarding = open ? boardingOf(open, state.observations) : undefined;
    if (!open || !boarding) return null;
    return buildTripCard(open.id, boarding, data, matchNetworkOf(data), records, instant);
  }, [data, state.rides, state.observations, records, instant]);

  // ─── Ações ───────────────────────────────────────────────────────────────

  const failed = useCallback(
    (retry: () => void) =>
      toast.show({
        title: t("toast.save_failed.title"),
        body: t("toast.save_failed.body"),
        kind: "error",
        haptic: "error",
        action: { label: t("toast.action.retry"), run: retry },
      }),
    [toast],
  );

  const undone = useCallback((body: string) => toast.show({ title: t("toast.undo_done.title"), body }), [toast]);

  const board = useCallback(
    async (stopId: string, choice: BoardChoice): Promise<boolean> => {
      const at = nowRef.current();
      const stopName = (scheduleRef.current.status === "ready" ? scheduleRef.current.data.stopNames.get(stopId) : undefined) ?? "";
      const attempt = async (): Promise<boolean> => {
        let token: BoardToken;
        try {
          token = await registro.board({ stopId, lineId: choice.lineId, at });
        } catch {
          failed(() => void attempt());
          return false;
        }
        const time = hhmm(at);
        toast.show({
          title: t("toast.board.title"),
          body: t("toast.board.body", { line: choice.code, stop_name: stopName, time }),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.undoBoard(token, nowRef.current());
                  await reload();
                  undone(t("toast.undo_board.body", { time }));
                } catch {
                  failed(() => {});
                }
              })(),
          },
        });
        void settle();
        return true;
      };
      return attempt();
    },
    [registro, toast, failed, undone, settle, reload],
  );

  const alight = useCallback(
    async (card: TripCardModel, row: AlightRow): Promise<boolean> => {
      if (!card.trip) return false;
      const trip = card.trip;
      const at = nowRef.current();
      const attempt = async (): Promise<boolean> => {
        let result: Awaited<ReturnType<typeof registro.alight>>;
        try {
          result = await registro.alight({ rideId: card.rideId, stopId: row.stopId, patternId: trip.patternId, position: row.position, at });
        } catch {
          failed(() => void attempt());
          return false;
        }
        if (!result.ok) {
          // Descida recusada (invariante 5): repetir não muda nada, então o toast some sozinho e a folha continua aberta.
          toast.show({ title: t("toast.save_failed.title"), body: t("toast.save_failed.body"), haptic: "error" });
          return false;
        }
        const token: AlightToken = result.token;
        toast.show({
          title: t("toast.alight.title"),
          body: t("toast.alight.body", { stop_name: row.name, time: hhmm(at), minutes: result.minutes }),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.undoAlight(token, nowRef.current());
                  await reload();
                  undone(t("toast.undo_alight.body"));
                } catch {
                  failed(() => {});
                }
              })(),
          },
        });
        void settle();
        return true;
      };
      return attempt();
    },
    [registro, toast, failed, undone, settle, reload],
  );

  const notBoarded = useCallback(
    (card: TripCardModel) => {
      const attempt = async () => {
        try {
          await registro.notBoarded(card.rideId, nowRef.current());
          await reload();
        } catch {
          failed(() => void attempt());
          return;
        }
        toast.show({
          title: t("toast.not_boarded.title"),
          body: t("toast.not_boarded.body", { line: card.line?.code ?? "", stop_name: card.stopName, time: card.boardedTime }),
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.undoNotBoarded(card.rideId, nowRef.current());
                  await reload();
                  undone(t("toast.undo_not_boarded.body"));
                } catch {
                  failed(() => {});
                }
              })(),
          },
        });
      };
      void attempt();
    },
    [registro, toast, failed, undone, reload],
  );

  const dismiss = useCallback(
    (card: TripCardModel) => {
      const attempt = async () => {
        try {
          await registro.dismiss(card.rideId, nowRef.current());
          await reload();
        } catch {
          failed(() => void attempt());
          return;
        }
        toast.show({
          title: t("toast.trip_dismissed.title"),
          body: t("toast.trip_dismissed.body"),
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.undoDismiss(card.rideId, nowRef.current());
                  await reload();
                  undone(t("toast.undo_alight.body"));
                } catch {
                  failed(() => {});
                }
              })(),
          },
        });
      };
      void attempt();
    },
    [registro, toast, failed, undone, reload],
  );

  const value = useMemo<RegistroValue>(
    () => ({ status: state.status, observations: state.observations, records, tripCard, board, alight, notBoarded, dismiss }),
    [state.status, state.observations, records, tripCard, board, alight, notBoarded, dismiss],
  );
  return <RegistroContext.Provider value={value}>{children}</RegistroContext.Provider>;
}

export function useRegistro(): RegistroValue {
  return useContext(RegistroContext);
}
