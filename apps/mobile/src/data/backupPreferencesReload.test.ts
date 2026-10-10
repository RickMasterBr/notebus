import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function checkBackupProviderPreferencesReload(source: string): {
  usesPreferences: boolean;
  usesScheduleReload: boolean;
  callsPreferencesInConfirm: boolean;
  callsPreferencesInUndo: boolean;
  callsScheduleReloadInConfirm: boolean;
  callsScheduleReloadInUndo: boolean;
  callsRescheduleInConfirm: boolean;
  callsRescheduleInUndo: boolean;
} {
  const usesPreferences = /\bconst\s+(\w+)\s*=\s*usePreferences\(\)/.test(source);
  const prefsVarMatch = source.match(/\bconst\s+(\w+)\s*=\s*usePreferences\(\)/);
  const prefsVar = prefsVarMatch ? prefsVarMatch[1] : "preferences";

  const usesScheduleReload = /\bconst\s+(\w+)\s*=\s*useScheduleReload\(\)/.test(source);
  const schedVarMatch = source.match(/\bconst\s+(\w+)\s*=\s*useScheduleReload\(\)/);
  const schedVar = schedVarMatch ? schedVarMatch[1] : "reloadSchedule";

  // Extrai o corpo de confirmImport (que antecede snooze)
  const confirmStartIndex = source.indexOf("const confirmImport = useCallback(");
  const confirmEndIndex = source.indexOf("const snooze =", confirmStartIndex);
  const confirmBody =
    confirmStartIndex !== -1 && confirmEndIndex !== -1
      ? source.slice(confirmStartIndex, confirmEndIndex)
      : "";

  // Procura chamada no bloco de undo
  const undoMatch = confirmBody.match(/undoImport\([\s\S]*?toast\.show/);
  const undoBody = undoMatch ? undoMatch[0] : "";

  // Procura chamada disparada fora do toast (o toast não espera)
  const lastToastIndex = confirmBody.lastIndexOf("toast.show(");
  const toastCloseIndex = lastToastIndex !== -1 ? confirmBody.indexOf("});", lastToastIndex) : -1;
  const postToastSection = toastCloseIndex !== -1 ? confirmBody.slice(toastCloseIndex) : "";

  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  const cleanUndoBody = stripComments(undoBody);
  const cleanPostToastSection = stripComments(postToastSection);

  const callsPreferencesInUndo = new RegExp(`\\b${prefsVar}\\.reload\\(\\)`).test(cleanUndoBody);
  const callsScheduleReloadInUndo = new RegExp(`\\b${schedVar}\\(\\)`).test(cleanUndoBody);
  const callsRescheduleInUndo = /\brequestReschedule\(\)/.test(cleanUndoBody);

  const callsPreferencesInConfirm = new RegExp(`\\b${prefsVar}\\.reload\\(\\)`).test(cleanPostToastSection);
  const callsScheduleReloadInConfirm = new RegExp(`\\b${schedVar}\\(\\)`).test(cleanPostToastSection);
  const callsRescheduleInConfirm = /\brequestReschedule\(\)/.test(cleanPostToastSection);

  return {
    usesPreferences,
    usesScheduleReload,
    callsPreferencesInConfirm,
    callsPreferencesInUndo,
    callsScheduleReloadInConfirm,
    callsScheduleReloadInUndo,
    callsRescheduleInConfirm,
    callsRescheduleInUndo,
  };
}

describe("backupPreferencesReload", () => {
  it("BackupProvider chama preferences.reload(), useScheduleReload() e requestReschedule() ao importar e no desfazer da importação", () => {
    const filePath = join(__dirname, "BackupProvider.tsx");
    const source = readFileSync(filePath, "utf8");
    const result = checkBackupProviderPreferencesReload(source);

    expect(result.usesPreferences).toBe(true);
    expect(result.usesScheduleReload).toBe(true);
    expect(result.callsPreferencesInConfirm).toBe(true);
    expect(result.callsPreferencesInUndo).toBe(true);
    expect(result.callsScheduleReloadInConfirm).toBe(true);
    expect(result.callsScheduleReloadInUndo).toBe(true);
    expect(result.callsRescheduleInConfirm).toBe(true);
    expect(result.callsRescheduleInUndo).toBe(true);
  });

  it("falha no código anterior à correção onde preferences, schedule e reschedule não eram chamados", () => {
    const previousSource = `
export function BackupProvider({ raw, backups, appVersion, children }) {
  const { observations, exclusive, refresh } = useRegistro();
  const recentStops = useRecentStops();
  const places = usePlaces();

  const confirmImport = useCallback(() => {
    toast.show({
      title: "done",
      action: {
        label: "undo",
        run: () => void (async () => {
          await exclusive(() => undoImport(raw, outcome.undo));
          await recentStops.reload();
          await places.reload();
          toast.show({ title: "undone" });
          await refresh();
        })(),
      },
    });
    void recentStops.reload();
    void places.reload();
    void refresh();
  }, [importSheet, raw, backups, exclusive, refresh, toast, recentStops, places]);

  const snooze = useCallback(() => {}, []);
}
`;
    const result = checkBackupProviderPreferencesReload(previousSource);

    expect(result.usesPreferences).toBe(false);
    expect(result.usesScheduleReload).toBe(false);
    expect(result.callsPreferencesInConfirm).toBe(false);
    expect(result.callsPreferencesInUndo).toBe(false);
    expect(result.callsScheduleReloadInConfirm).toBe(false);
    expect(result.callsScheduleReloadInUndo).toBe(false);
    expect(result.callsRescheduleInConfirm).toBe(false);
    expect(result.callsRescheduleInUndo).toBe(false);
  });
});
