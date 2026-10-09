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
import { type PassageRecord, baseTimeAt, displayCenter, lisbonWallClock } from "@notebus/domain";
import type { BoardChoice } from "./boardChoices";
import { useNow } from "./NowProvider";
import { usePositionStore } from "./PositionProvider";
import { realNow } from "./clock";
import { fixForRecord } from "./recordFix";
import { useSchedule } from "./ScheduleProvider";
import { useToast } from "./ToastProvider";
import {
  type AlightToken,
  type BoardToken,
  type EditPatch,
  type EditResult,
  type EditToken,
  type ManualResult,
  type ObservationRow,
  type RideRow,
  createRegistro,
} from "./registro";
import { matchNetworkOf, passageRecords } from "./records";
import { type AlightRow, type TripCardModel, boardingOf, buildTripCard } from "./rideView";
import { clockText } from "./stopCard";
import { useNowTick } from "./useNowTick";
import { requestReschedule } from "../notifications/runtime";
import { onPendingIntent, peekPendingIntent, takePendingIntent } from "../notifications/pendingIntent";
import { openRecordSheet, sheetsAvailable } from "../sheets/SheetsContext";
import { t } from "../i18n";

type Db = Parameters<typeof createRegistro>[0];

export interface RegistroValue {
  status: "loading" | "ready";
  observations: readonly ObservationRow[];
  rides: readonly RideRow[];
  /** Os registros aceitos, no formato da estatística (`expectedTime`). */
  records: readonly PassageRecord[];
  /** O cartão do `ride` aberto; `null` sem viagem em curso (ou com os horários ainda carregando). */
  tripCard: TripCardModel | null;
  /** Embarque na linha escolhida da folha Registrar. Devolve o `observationId` se o fato foi gravado. */
  board: (stopId: string, choice: BoardChoice) => Promise<string | null>;
  /** "Desci aqui" numa paragem da lista. Devolve `true` se a descida foi gravada. */
  alight: (card: TripCardModel, row: AlightRow) => Promise<boolean>;
  notBoarded: (card: TripCardModel) => void;
  dismiss: (card: TripCardModel) => void;
  /** Edição do fato na TL-06 com toast e Desfazer. */
  edit: (id: string, patch: EditPatch) => Promise<EditResult>;
  /** Escolha manual na TL-09 com toast e Desfazer. */
  chooseManual: (id: string, choice: { tripId: string; position: number; serviceDate: string; lineId?: string }) => Promise<ManualResult>;
  /** "Não sei" na TL-09 com toast e Desfazer. */
  dismissReview: (id: string) => Promise<void>;
  /** Apaga o registro na TL-06 com toast e Desfazer. */
  remove: (id: string) => Promise<{ pair: boolean; token: EditToken }>;
  /** Roda `job` na fila das gravações (o backup: importar e o Desfazer, uma transação por vez). */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
  /** Relê os registros, refaz a fila de deduções e relê de novo, sem bloquear quem chamou. */
  refresh: () => Promise<void>;
}

const nothing = async () => false;
const RegistroContext = createContext<RegistroValue>({
  status: "loading",
  observations: [],
  rides: [],
  records: [],
  tripCard: null,
  board: async () => null,
  alight: nothing,
  notBoarded: () => {},
  dismiss: () => {},
  edit: async () => ({ changed: false, rejected: [], token: null }),
  chooseManual: async () => ({ ok: false, problem: "uninitialized" }),
  dismissReview: async () => {},
  remove: async () => ({ pair: false, token: { observations: [], rides: [], createdRideIds: [] } }),
  exclusive: (job) => job(),
  refresh: async () => {},
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
  const positionStore = usePositionStore();
  const positionRef = useRef(positionStore);
  positionRef.current = positionStore;

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
    requestReschedule(); // o aviso usa o que você registrou (E-06 §3.2); não espera
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

  // "Ajustar" da confirmação do embarque (E-06 §5.3): o registro foi gravado sem o app aberto; recarrega e só então abre a
  // folha (senão ela fecharia, por não achar o registro). O `goto` do toque no corpo é do bloco 3 e fica no intento.
  useEffect(() => {
    const consume = () => {
      const intent = peekPendingIntent();
      if (intent?.kind !== "adjust" || !sheetsAvailable()) return;
      takePendingIntent();
      void settle().then(() => openRecordSheet(intent.observationId));
    };
    consume();
    return onPendingIntent(consume);
  }, [settle]);

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
      if (next === "active" && scheduleReady) {
        void expire();
        void settle(); // o embarque gravado pelo botão do aviso, sem o app aberto, aparece e ganha a dedução
      }
    });
    return () => sub.remove();
  }, [scheduleReady, expire, settle]);

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
    async (stopId: string, choice: BoardChoice): Promise<string | null> => {
      const at = nowRef.current();
      const gps = fixForRecord(positionRef.current.getFix(), realNow()); // já em memória: nada espera o GPS (D-102)
      const stopName = (scheduleRef.current.status === "ready" ? scheduleRef.current.data.stopNames.get(stopId) : undefined) ?? "";
      const attempt = async (): Promise<string | null> => {
        let token: BoardToken;
        try {
          token = await registro.board({ stopId, lineId: choice.lineId, at, gps });
        } catch {
          failed(() => void attempt());
          return null;
        }
        const time = hhmm(at);
        const observationId = token.observationId;
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
          secondaryAction: {
            label: t("toast.action.adjust"),
            run: () => {
              openRecordSheet(observationId);
            },
          },
        });
        void settle();
        return observationId;
      };
      return attempt();
    },
    [registro, toast, failed, undone, settle, reload],
  );

  const edit = useCallback(
    async (id: string, patch: EditPatch): Promise<EditResult> => {
      const at = nowRef.current();
      const row = state.observations.find((o) => o.id === id);
      if (!row) throw new Error("registro não encontrado");
      const prevTimeText = hhmm(row.observedAt);
      let result: EditResult;
      try {
        result = await registro.edit(id, patch, at);
      } catch {
        failed(() => void edit(id, patch));
        return { changed: false, rejected: [], token: null };
      }

      if (result.rejected.length > 0) {
        const code = result.rejected[0]!.code;
        let problemText = t("toast.save_failed.body");
        if (code === "before_boarding") problemText = t("sheet_record.problem.before_boarding");
        else if (code === "position_not_after") problemText = t("sheet_record.problem.position_not_after");
        else if (code === "pattern_differs") problemText = t("sheet_record.problem.pattern_differs");
        else if (code === "future") problemText = t("sheet_record.problem.future");
        else if (code === "invalid_interval") problemText = t("sheet_record.problem.invalid_interval");

        const token = result.token;
        toast.show({
          title: t("toast.record_not_saved.title"),
          body: problemText,
          kind: "error",
          haptic: "error",
          action: token
            ? {
                label: t("toast.action.undo"),
                run: () =>
                  void (async () => {
                    try {
                      await registro.restore(token, nowRef.current());
                      await reload();
                      undone(t("toast.undo_record.body", { time: prevTimeText }));
                    } catch {
                      failed(() => {});
                    }
                  })(),
              }
            : undefined,
        });
      } else if (result.changed && result.token) {
        const token = result.token;
        const lineCode =
          scheduleRef.current.status === "ready"
            ? (scheduleRef.current.data.lineInfo.get(row.lineId)?.code ?? row.lineId)
            : row.lineId;
        const stopName =
          scheduleRef.current.status === "ready" ? (scheduleRef.current.data.stopNames.get(row.stopId) ?? "") : "";
        const effectiveAt = patch.observedAt ?? row.observedAt;
        const timeText = hhmm(effectiveAt);

        toast.show({
          title: t("toast.record_changed.title"),
          body: t("toast.record_changed.body", { line: lineCode, stop_name: stopName, time: timeText }),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: () =>
              void (async () => {
                try {
                  await registro.restore(token, nowRef.current());
                  await reload();
                  undone(t("toast.undo_record.body", { time: prevTimeText }));
                } catch {
                  failed(() => {});
                }
              })(),
          },
        });
      }

      if (result.changed) {
        await reload();
        void settle();
      }
      return result;
    },
    [registro, state.observations, failed, undone, reload, settle, toast],
  );

  const chooseManual = useCallback(
    async (
      id: string,
      choice: { tripId: string; position: number; serviceDate: string; lineId?: string },
    ): Promise<ManualResult> => {
      const at = nowRef.current();
      const row = state.observations.find((o) => o.id === id);
      if (!row) throw new Error("registro não encontrado");
      let result: ManualResult;
      try {
        result = await registro.chooseManual(id, choice, at);
      } catch {
        failed(() => void chooseManual(id, choice));
        return { ok: false, problem: "failed" };
      }

      if (!result.ok) {
        const body =
          result.problem === "alight_conflict"
            ? t("sheet_verify.problem.alight_conflict")
            : t("toast.save_failed.body");
        toast.show({
          title: t("toast.save_failed.title"),
          body,
          haptic: "error",
        });
        return result;
      }

      const token = result.token;
      const isOtherLine = Boolean(choice.lineId && choice.lineId !== row.lineId);
      const targetLineId = choice.lineId ?? row.lineId;
      const lineCode =
        scheduleRef.current.status === "ready"
          ? (scheduleRef.current.data.lineInfo.get(targetLineId)?.code ?? targetLineId)
          : targetLineId;

      const trip =
        scheduleRef.current.status === "ready"
          ? scheduleRef.current.data.trips.find((t) => t.id === choice.tripId)
          : undefined;
      const firstBase = trip ? baseTimeAt(trip, trip.firstPosition) : null;
      const tripTime = firstBase ? clockText(displayCenter(firstBase.minute)) : "";

      const body = isOtherLine
        ? t("toast.verified_other_line.body", { line: lineCode, time: tripTime })
        : t("toast.verified.body", { line: lineCode, time: tripTime });

      toast.show({
        title: t("toast.verified.title"),
        body,
        haptic: "success",
        action: {
          label: t("toast.action.undo"),
          run: () =>
            void (async () => {
              try {
                await registro.restore(token, nowRef.current());
                await reload();
                undone(t("toast.undo_verify.body"));
              } catch {
                failed(() => {});
              }
            })(),
        },
      });

      await reload();
      void settle();
      return result;
    },
    [registro, state.observations, failed, undone, reload, settle, toast],
  );

  const dismissReview = useCallback(
    async (id: string): Promise<void> => {
      const at = nowRef.current();
      let token: EditToken | null;
      try {
        token = await registro.dismissReview(id, at);
      } catch {
        failed(() => void dismissReview(id));
        return;
      }

      toast.show({
        title: t("toast.dont_know.title"),
        body: t("toast.dont_know.body"),
        action: token
          ? {
              label: t("toast.action.undo"),
              run: () =>
                void (async () => {
                  try {
                    await registro.restore(token, nowRef.current());
                    await reload();
                    undone(t("toast.undo_verify.body"));
                  } catch {
                    failed(() => {});
                  }
                })(),
            }
          : undefined,
      });

      await reload();
      void settle();
    },
    [registro, failed, undone, reload, settle, toast],
  );

  const remove = useCallback(
    async (id: string): Promise<{ pair: boolean; token: EditToken }> => {
      const at = nowRef.current();
      const row = state.observations.find((o) => o.id === id);
      if (!row) throw new Error("registro não encontrado");
      let result: { pair: boolean; token: EditToken };
      try {
        result = await registro.remove(id, at);
      } catch {
        failed(() => void remove(id));
        throw new Error("falha ao apagar registro");
      }

      const lineCode =
        scheduleRef.current.status === "ready"
          ? (scheduleRef.current.data.lineInfo.get(row.lineId)?.code ?? row.lineId)
          : row.lineId;
      const timeText = hhmm(row.observedAt);

      toast.show({
        title: result.pair ? t("toast.record_deleted_pair.title") : t("toast.record_deleted.title"),
        body: t("toast.record_deleted.body", { line: lineCode, time: timeText }),
        action: {
          label: t("toast.action.undo"),
          run: () =>
            void (async () => {
              try {
                await registro.restore(result.token, nowRef.current());
                await reload();
                undone(t("toast.undo_delete.body"));
              } catch {
                failed(() => {});
              }
            })(),
        },
      });

      await reload();
      void settle();
      return result;
    },
    [registro, state.observations, failed, undone, reload, settle, toast],
  );

  const alight = useCallback(
    async (card: TripCardModel, row: AlightRow): Promise<boolean> => {
      if (!card.trip) return false;
      const trip = card.trip;
      const at = nowRef.current();
      const gps = fixForRecord(positionRef.current.getFix(), realNow());
      const attempt = async (): Promise<boolean> => {
        let result: Awaited<ReturnType<typeof registro.alight>>;
        try {
          result = await registro.alight({ rideId: card.rideId, stopId: row.stopId, patternId: trip.patternId, position: row.position, at, gps });
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

  const exclusive = registro.exclusive;
  const value = useMemo<RegistroValue>(
    () => ({
      status: state.status,
      observations: state.observations,
      rides: state.rides,
      records,
      tripCard,
      board,
      alight,
      notBoarded,
      dismiss,
      edit,
      chooseManual,
      dismissReview,
      remove,
      exclusive,
      refresh: settle,
    }),
    [
      state.status,
      state.observations,
      state.rides,
      records,
      tripCard,
      board,
      alight,
      notBoarded,
      dismiss,
      edit,
      chooseManual,
      dismissReview,
      remove,
      exclusive,
      settle,
    ],
  );
  return <RegistroContext.Provider value={value}>{children}</RegistroContext.Provider>;
}

export function useRegistro(): RegistroValue {
  return useContext(RegistroContext);
}
