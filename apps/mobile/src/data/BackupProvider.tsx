/**
 * O backup na árvore de telas (E-03 §5): exportar, importar com prévia e Desfazer, e o lembrete da folha inicial
 * (D-088). A lógica está em `backupFlow.ts`, `db/backup.ts` e no domínio; aqui ficam o toast, o estado da prévia e o
 * "agora" do `NowProvider` (o relógio de teste vale: é assim que o A8 é testado).
 *
 * As gravações (importar, o Desfazer, o `last_export_at`, o "Agora não") passam pela fila do registro: uma transação
 * por vez no mesmo banco.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type BackupProblem, backupReminder, lisbonWallClock, snoozeUntil, uuidv7 } from "@notebus/domain";
import {
  BACKUP_REMINDER_SNOOZED_UNTIL,
  type ImportOutcome,
  importBackup,
  readReminderState,
  undoImport,
  writeSettingNumber,
} from "../db/backup";
import type { ImportDb } from "../db/importMobilis";
import type { BackupStore } from "../db/migrate";
import { t } from "../i18n";
import { type ImportPreview, exportBackup, prepareImport } from "./backupFlow";
import { nativeExportIO, nativeSha256, pickBackupText } from "./backupNative";
import { useNow } from "./NowProvider";
import { useRecentStops } from "./RecentStopsProvider";
import { useRegistro } from "./RegistroProvider";
import { useToast } from "./ToastProvider";
import { useNowTick } from "./useNowTick";

export type ImportSheetState =
  | { status: "checking" }
  | { status: "ready"; preview: Extract<ImportPreview, { ok: true }> }
  | { status: "error"; message: string };

interface BackupValue {
  /** Epoch ms do último export, ou `null`. */
  lastExportAt: number | null;
  reminder: { show: boolean; daysSince: number | null };
  exportNow: () => void;
  /** Abre o seletor; `true` se um arquivo foi escolhido (quem chamou abre a folha da prévia). */
  startImport: () => Promise<boolean>;
  importSheet: ImportSheetState | null;
  confirmImport: () => void;
  cancelImport: () => void;
  snooze: () => void;
}

const BackupContext = createContext<BackupValue>({
  lastExportAt: null,
  reminder: { show: false, daysSince: null },
  exportNow: () => {},
  startImport: async () => false,
  importSheet: null,
  confirmImport: () => {},
  cancelImport: () => {},
  snooze: () => {},
});

/** "25/10/2026", no dia de Lisboa. */
export function lisbonDateText(at: number): string {
  const [y, m, d] = lisbonWallClock(at).date.split("-");
  return `${d}/${m}/${y}`;
}

/** O texto de cada recusa da importação (códigos estáveis do domínio). */
export function problemText(problem: BackupProblem, missing: { version: string }[] = []): string {
  switch (problem) {
    case "not_json":
      return t("backup.problem.not_json");
    case "not_backup":
      return t("backup.problem.not_backup");
    case "checksum_mismatch":
      return t("backup.problem.checksum_mismatch");
    case "format_newer":
      return t("backup.problem.format_newer");
    case "format_unknown":
      return t("backup.problem.format_unknown");
    case "counts_mismatch":
      return t("backup.problem.counts_mismatch");
    case "dataset_missing":
      return t("backup.problem.dataset_missing", { versions: missing.map((m) => m.version).join(", ") });
  }
}

export function BackupProvider({
  raw,
  backups,
  appVersion,
  children,
}: {
  raw: ImportDb;
  /** Onde fica a cópia do banco antes de importar (o mesmo mecanismo da migração, E-01 §6). */
  backups: () => Promise<BackupStore>;
  appVersion: string;
  children: ReactNode;
}) {
  const now = useNow();
  const nowRef = useRef(now);
  nowRef.current = now;
  const instant = useNowTick();
  const toast = useToast();
  const { observations, exclusive, refresh } = useRegistro();
  const recentStops = useRecentStops();
  const [state, setState] = useState<Awaited<ReturnType<typeof readReminderState>> | null>(null);
  const [importSheet, setImportSheet] = useState<ImportSheetState | null>(null);
  const busy = useRef(false);

  const loadReminder = useCallback(async () => {
    try {
      setState(await readReminderState(raw));
    } catch {
      // sem lembrete nesta vez; nada se perde
    }
  }, [raw]);
  // Abertura e cada mudança nos registros (registrar, desfazer, importar).
  useEffect(() => {
    void loadReminder();
  }, [loadReminder, observations]);

  const reminder = useMemo(
    () => (state ? backupReminder({ now: instant, ...state }) : { show: false, daysSince: null }),
    [state, instant],
  );

  const exportNow = useCallback(() => {
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      const at = nowRef.current();
      try {
        // Na fila: o `last_export_at` não entra no meio da transação de um registro.
        const result = await exclusive(() =>
          exportBackup(raw, { now: at, appVersion, sha256: nativeSha256, io: nativeExportIO, newId: () => uuidv7(at) }),
        );
        if (!result.ok) {
          toast.show({
            title: t("toast.export_failed.title"),
            body: result.stage === "share" ? t("toast.export_failed.share") : t("toast.export_failed.verify"),
            kind: "error",
            haptic: "error",
            action: { label: t("toast.action.retry"), run: () => void run() },
          });
        }
      } catch {
        toast.show({
          title: t("toast.export_failed.title"),
          body: t("toast.export_failed.verify"),
          kind: "error",
          haptic: "error",
          action: { label: t("toast.action.retry"), run: () => void run() },
        });
      } finally {
        busy.current = false;
        await loadReminder();
      }
    };
    void run();
  }, [raw, appVersion, exclusive, toast, loadReminder]);

  const startImport = useCallback(async (): Promise<boolean> => {
    let text: string | null;
    try {
      text = await pickBackupText();
    } catch {
      text = "";
    }
    if (text === null) return false;
    setImportSheet({ status: "checking" });
    void (async () => {
      try {
        const preview = await prepareImport(raw, text, nativeSha256);
        setImportSheet(preview.ok ? { status: "ready", preview } : { status: "error", message: problemText(preview.problem, preview.missing) });
      } catch {
        setImportSheet({ status: "error", message: problemText("not_json") });
      }
    })();
    return true;
  }, [raw]);

  const cancelImport = useCallback(() => setImportSheet(null), []);

  const confirmImport = useCallback(() => {
    if (importSheet?.status !== "ready") return;
    const { file } = importSheet.preview;
    setImportSheet(null);
    void (async () => {
      const at = nowRef.current();
      let outcome: ImportOutcome;
      try {
        outcome = await exclusive(async () => importBackup(raw, file, { backups: await backups(), now: at }));
      } catch {
        toast.show({ title: t("toast.import_failed.title"), body: t("toast.import_failed.body"), kind: "error", haptic: "error" });
        return;
      }
      const obs = outcome.byTable.observation;
      toast.show({
        title: t("toast.import_done.title", { count: (obs?.inserted ?? 0) + (obs?.replaced ?? 0) }),
        haptic: "success",
        action: {
          label: t("toast.action.undo"),
          run: () =>
            void (async () => {
              try {
                await exclusive(() => undoImport(raw, outcome.undo));
                await recentStops.reload();
                toast.show({ title: t("toast.import_undone.title") });
              } catch {
                toast.show({ title: t("toast.import_failed.title"), body: t("toast.import_failed.body"), kind: "error", haptic: "error" });
              }
              await refresh();
            })(),
        },
      });
      // Invalida os recentes e a fila refaz as deduções dos importados; o toast não espera.
      void recentStops.reload();
      void refresh();
    })();
  }, [importSheet, raw, backups, exclusive, refresh, toast]);

  const snooze = useCallback(() => {
    const at = nowRef.current();
    void (async () => {
      try {
        await exclusive(() => writeSettingNumber(raw, BACKUP_REMINDER_SNOOZED_UNTIL, snoozeUntil(at), at, () => uuidv7(at)));
      } catch {
        // continua aparecendo; nada se perde
      }
      await loadReminder();
    })();
  }, [raw, exclusive, loadReminder]);

  const value = useMemo<BackupValue>(
    () => ({
      lastExportAt: state?.lastExportAt ?? null,
      reminder,
      exportNow,
      startImport,
      importSheet,
      confirmImport,
      cancelImport,
      snooze,
    }),
    [state, reminder, exportNow, startImport, importSheet, confirmImport, cancelImport, snooze],
  );
  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>;
}

export function useBackup(): BackupValue {
  return useContext(BackupContext);
}
