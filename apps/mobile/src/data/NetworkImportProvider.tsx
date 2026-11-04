/**
 * Importar rede nova pelas Configurações (ideia 249): escolhe o arquivo, mostra o resumo, aplica na fila `exclusive`,
 * recarrega o horário, reagenda os avisos e oferece Desfazer. A lógica está em `db/networkImport.ts`; aqui ficam o
 * estado da página e o toast (mesmo padrão do `BackupProvider`).
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { pickNetworkJson } from "../db/importFromFile";
import type { ImportDb } from "../db/importMobilis";
import type { BackupStore } from "../db/migrate";
import { applyNetworkImport, prepareNetworkImport, undoNetworkImport } from "../db/networkImport";
import { t } from "../i18n";
import { requestReschedule } from "../notifications/runtime";
import { useNow } from "./NowProvider";
import { useRegistro } from "./RegistroProvider";
import { useScheduleReload } from "./ScheduleProvider";
import { useToast } from "./ToastProvider";

export type NetworkImportState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; summary: string; jaInstalada: boolean }
  | { status: "error"; message: string }
  | { status: "applying" };

interface NetworkImportValue {
  state: NetworkImportState;
  /** Abre o seletor; `true` se um arquivo foi escolhido (quem chamou abre a página). */
  start: () => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
}

const NetworkImportContext = createContext<NetworkImportValue>({
  state: { status: "idle" },
  start: async () => false,
  confirm: () => {},
  cancel: () => {},
});

/** "2026-11-05" → "05/11/2026". */
const dateText = (iso: string) => iso.split("-").reverse().join("/");

export function NetworkImportProvider({ raw, backups, children }: { raw: ImportDb; backups: () => Promise<BackupStore>; children: ReactNode }) {
  const now = useNow();
  const nowRef = useRef(now);
  nowRef.current = now;
  const toast = useToast();
  const { exclusive, refresh } = useRegistro();
  const reloadSchedule = useScheduleReload();
  const [state, setState] = useState<NetworkImportState>({ status: "idle" });
  const json = useRef<unknown>(null);

  const start = useCallback(async (): Promise<boolean> => {
    let picked: unknown;
    try {
      picked = await pickNetworkJson();
    } catch {
      picked = undefined; // ilegível: cai no "inválido" abaixo
    }
    if (picked === null) return false;
    json.current = picked;
    setState({ status: "checking" });
    try {
      const preview = await prepareNetworkImport(raw, picked);
      setState(
        preview.ok
          ? {
              status: "ready",
              jaInstalada: preview.jaInstalada,
              summary: t("settings.network_import.summary", {
                from: dateText(preview.vigencia),
                lines: preview.lines,
                stops: preview.stops,
                trips: preview.trips,
              }),
            }
          : { status: "error", message: t("settings.network_import.invalid") },
      );
    } catch {
      setState({ status: "error", message: t("settings.network_import.invalid") });
    }
    return true;
  }, [raw]);

  const cancel = useCallback(() => {
    json.current = null;
    setState({ status: "idle" });
  }, []);

  const confirm = useCallback(() => {
    if (state.status !== "ready" || state.jaInstalada) return;
    const file = json.current;
    setState({ status: "applying" });
    void (async () => {
      const failed = () =>
        toast.show({ title: t("toast.network_import_failed.title"), body: t("toast.network_import_failed.body"), kind: "error", haptic: "error" });
      const reload = async () => {
        await reloadSchedule();
        requestReschedule();
        await refresh();
      };
      try {
        const store = await backups();
        const result = await exclusive(() => applyNetworkImport(raw, file, { backups: store, now: nowRef.current() }));
        if (!result.ok) {
          failed();
        } else {
          toast.show({
            title: t("toast.network_import_done.title"),
            haptic: "success",
            action: {
              label: t("toast.action.undo"),
              run: () =>
                void (async () => {
                  try {
                    await exclusive(() => undoNetworkImport(store, result.copyName));
                    toast.show({ title: t("toast.network_import_undone.title") });
                  } catch {
                    failed();
                  }
                  await reload();
                })(),
            },
          });
          await reload();
        }
      } catch {
        failed();
      }
      json.current = null;
      setState({ status: "idle" });
    })();
  }, [state, raw, backups, exclusive, refresh, toast, reloadSchedule]);

  const value = useMemo<NetworkImportValue>(() => ({ state, start, confirm, cancel }), [state, start, confirm, cancel]);
  return <NetworkImportContext.Provider value={value}>{children}</NetworkImportContext.Provider>;
}

export function useNetworkImport(): NetworkImportValue {
  return useContext(NetworkImportContext);
}
