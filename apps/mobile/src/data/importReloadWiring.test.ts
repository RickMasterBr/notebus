/**
 * Guarda estática da fiação "pontos do mapa e da busca depois de importar" (ideia 223).
 * GUARDA DE TEXTO: confere o código-fonte, não o efeito em tela montada (a marcação roxa: só o iPhone).
 *
 * `useStopLocations()` devolve `reload()`; o `StopIndexProvider` expõe a recarga por `useReloadStopIndex()`
 * (o `useStopIndex()` devolve o estado, não a função).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
const read = (name: string) => stripComments(readFileSync(join(__dirname, name), "utf8").replace(/\r\n/g, "\n"));

export function checkBackupProviderImportReload(source: string): {
  usesStopLocations: boolean;
  usesStopIndexReload: boolean;
  callsLocationsInImport: boolean;
  callsLocationsInUndo: boolean;
  callsIndexInImport: boolean;
  callsIndexInUndo: boolean;
} {
  const locMatch = source.match(/\bconst\s+(\w+)\s*=\s*useStopLocations\(\)/);
  const idxMatch = source.match(/\bconst\s+(\w+)\s*=\s*useReloadStopIndex\(\)/);
  const locVar = locMatch ? locMatch[1] : "stopLocations";
  const idxVar = idxMatch ? idxMatch[1] : "reloadStopIndex";

  // Extrai o corpo de confirmImport (que antecede snooze), como no backupPlacesReload.test.ts.
  const confirmStart = source.indexOf("const confirmImport = useCallback(");
  const confirmEnd = source.indexOf("const snooze =", confirmStart);
  const confirmBody = confirmStart !== -1 && confirmEnd !== -1 ? source.slice(confirmStart, confirmEnd) : "";

  // Desfazer: do undoImport até o toast que o segue.
  const undoMatch = confirmBody.match(/undoImport\([\s\S]*?toast\.show/);
  const undoBody = undoMatch ? undoMatch[0] : "";

  // Importar: disparado depois do toast (o toast não espera).
  const lastToast = confirmBody.lastIndexOf("toast.show(");
  const toastClose = lastToast !== -1 ? confirmBody.indexOf("});", lastToast) : -1;
  const importBody = toastClose !== -1 ? confirmBody.slice(toastClose) : "";

  return {
    usesStopLocations: locMatch !== null,
    usesStopIndexReload: idxMatch !== null,
    callsLocationsInImport: new RegExp(`\\b${locVar}\\.reload\\(\\)`).test(importBody),
    callsLocationsInUndo: new RegExp(`\\b${locVar}\\.reload\\(\\)`).test(undoBody),
    callsIndexInImport: new RegExp(`\\b${idxVar}\\(\\)`).test(importBody),
    callsIndexInUndo: new RegExp(`\\b${idxVar}\\(\\)`).test(undoBody),
  };
}

export function checkNetworkProviderImportReload(source: string): {
  usesStopLocations: boolean;
  usesStopIndexReload: boolean;
  callsLocationsInReload: boolean;
  callsIndexInReload: boolean;
  callsReloadInApply: boolean;
  callsReloadInUndo: boolean;
} {
  const locMatch = source.match(/\bconst\s+(\w+)\s*=\s*useStopLocations\(\)/);
  const idxMatch = source.match(/\bconst\s+(\w+)\s*=\s*useReloadStopIndex\(\)/);
  const locVar = locMatch ? locMatch[1] : "stopLocations";
  const idxVar = idxMatch ? idxMatch[1] : "reloadStopIndex";

  // A recarga compartilhada pelos dois caminhos.
  const reloadStart = source.indexOf("const reload = async () => {");
  const reloadEnd = reloadStart !== -1 ? source.indexOf("};", reloadStart) : -1;
  const reloadBody = reloadStart !== -1 && reloadEnd !== -1 ? source.slice(reloadStart, reloadEnd) : "";

  // Desfazer: do undoNetworkImport até o fim da função que ele abre.
  const undoStart = source.indexOf("undoNetworkImport(");
  const undoEnd = undoStart !== -1 ? source.indexOf("})(),", undoStart) : -1;
  const undoBody = undoStart !== -1 && undoEnd !== -1 ? source.slice(undoStart, undoEnd) : "";

  // Aplicar: depois do toast de sucesso, antes de a página voltar a "idle".
  const doneToast = source.indexOf('t("toast.network_import_done.title")');
  const doneToastClose = doneToast !== -1 ? source.indexOf("});", doneToast) : -1;
  const applyEnd = doneToastClose !== -1 ? source.indexOf('setState({ status: "idle" })', doneToastClose) : -1;
  const applyBody = doneToastClose !== -1 && applyEnd !== -1 ? source.slice(doneToastClose, applyEnd) : "";

  return {
    usesStopLocations: locMatch !== null,
    usesStopIndexReload: idxMatch !== null,
    callsLocationsInReload: new RegExp(`\\b${locVar}\\.reload\\(\\)`).test(reloadBody),
    callsIndexInReload: new RegExp(`\\b${idxVar}\\(\\)`).test(reloadBody),
    callsReloadInApply: /\bawait reload\(\)/.test(applyBody),
    callsReloadInUndo: /\bawait reload\(\)/.test(undoBody),
  };
}

describe("importReloadWiring", () => {
  it("BackupProvider recarrega os pontos e o índice ao importar e no desfazer da importação", () => {
    const result = checkBackupProviderImportReload(read("BackupProvider.tsx"));

    expect(result.usesStopLocations).toBe(true);
    expect(result.usesStopIndexReload).toBe(true);
    expect(result.callsLocationsInImport).toBe(true);
    expect(result.callsLocationsInUndo).toBe(true);
    expect(result.callsIndexInImport).toBe(true);
    expect(result.callsIndexInUndo).toBe(true);
  });

  it("falha no código anterior à correção, que não recarregava pontos nem índice", () => {
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
    expect(checkBackupProviderImportReload(previousSource)).toEqual({
      usesStopLocations: false,
      usesStopIndexReload: false,
      callsLocationsInImport: false,
      callsLocationsInUndo: false,
      callsIndexInImport: false,
      callsIndexInUndo: false,
    });
  });

  it("NetworkImportProvider recarrega os pontos e o índice ao importar e no desfazer da importação", () => {
    const result = checkNetworkProviderImportReload(read("NetworkImportProvider.tsx"));

    expect(result.usesStopLocations).toBe(true);
    expect(result.usesStopIndexReload).toBe(true);
    expect(result.callsLocationsInReload).toBe(true);
    expect(result.callsIndexInReload).toBe(true);
    expect(result.callsReloadInApply).toBe(true);
    expect(result.callsReloadInUndo).toBe(true);
  });

  it("falha no código anterior à correção, que só recarregava o horário", () => {
    const previousSource = `
export function NetworkImportProvider({ raw, backups, children }) {
  const reloadSchedule = useScheduleReload();
  const { exclusive, refresh } = useRegistro();

  const confirm = useCallback(() => {
    const reload = async () => {
      await reloadSchedule();
      requestReschedule();
      await refresh();
    };
    toast.show({
      title: t("toast.network_import_done.title"),
      haptic: "success",
      action: {
        label: t("toast.action.undo"),
        run: () =>
          void (async () => {
            await exclusive(() => undoNetworkImport(store, result.copyName));
          })(),
      },
    });
    await reload();
    json.current = null;
    setState({ status: "idle" });
  }, [state, raw, backups, exclusive, refresh, toast, reloadSchedule]);

  const value = useMemo(() => ({ state: { status: "idle" } }), []);
}
`;
    expect(checkNetworkProviderImportReload(previousSource)).toEqual({
      usesStopLocations: false,
      usesStopIndexReload: false,
      callsLocationsInReload: false,
      callsIndexInReload: false,
      callsReloadInApply: true,
      callsReloadInUndo: false,
    });
  });
});
