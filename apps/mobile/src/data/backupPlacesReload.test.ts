import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function checkBackupProviderPlacesReload(source: string): {
  usesPlaces: boolean;
  callsPlacesInConfirm: boolean;
  callsPlacesInUndo: boolean;
} {
  const usesPlaces = /\bconst\s+(\w+)\s*=\s*usePlaces\(\)/.test(source);
  const placesVarMatch = source.match(/\bconst\s+(\w+)\s*=\s*usePlaces\(\)/);
  const placesVar = placesVarMatch ? placesVarMatch[1] : "places";

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
  const callsPlacesInUndo = new RegExp(`\\b${placesVar}\\.reload\\(\\)`).test(undoBody);

  // Procura chamada disparada fora do toast (o toast não espera)
  const lastToastIndex = confirmBody.lastIndexOf("toast.show(");
  const toastCloseIndex = lastToastIndex !== -1 ? confirmBody.indexOf("});", lastToastIndex) : -1;
  const postToastSection = toastCloseIndex !== -1 ? confirmBody.slice(toastCloseIndex) : "";
  const callsPlacesInConfirm = new RegExp(`\\b${placesVar}\\.reload\\(\\)`).test(postToastSection);

  return {
    usesPlaces,
    callsPlacesInConfirm,
    callsPlacesInUndo,
  };
}

describe("backupPlacesReload", () => {
  it("BackupProvider chama places.reload() ao importar e no desfazer da importação", () => {
    const filePath = join(__dirname, "BackupProvider.tsx");
    const source = readFileSync(filePath, "utf8");
    const result = checkBackupProviderPlacesReload(source);

    expect(result.usesPlaces).toBe(true);
    expect(result.callsPlacesInConfirm).toBe(true);
    expect(result.callsPlacesInUndo).toBe(true);
  });

  it("falha no código anterior à correção onde places.reload() não era chamado", () => {
    const previousSource = `
export function BackupProvider({ raw, backups, appVersion, children }) {
  const { observations, exclusive, refresh } = useRegistro();
  const recentStops = useRecentStops();

  const confirmImport = useCallback(() => {
    toast.show({
      title: "done",
      action: {
        label: "undo",
        run: () => void (async () => {
          await exclusive(() => undoImport(raw, outcome.undo));
          await recentStops.reload();
          toast.show({ title: "undone" });
          await refresh();
        })(),
      },
    });
    void recentStops.reload();
    void refresh();
  }, [importSheet, raw, backups, exclusive, refresh, toast]);

  const snooze = useCallback(() => {}, []);
}
`;
    const result = checkBackupProviderPlacesReload(previousSource);

    expect(result.usesPlaces).toBe(false);
    expect(result.callsPlacesInConfirm).toBe(false);
    expect(result.callsPlacesInUndo).toBe(false);
  });
});
