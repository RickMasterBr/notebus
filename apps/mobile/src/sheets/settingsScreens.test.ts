/// <reference types="node" />
/**
 * Ajustes como telas (contrato v1-e2-02, D-400): cada página é uma entrada `settings` com `page`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { settingsPageTitle } from "../data/settingsIndex";
import { initialSheetState, sheetReducer, type SettingsPageId, type SheetContent } from "./stack";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

const push = (sheet: SheetContent) => ({ type: "push" as const, sheet });
const settings = (page?: SettingsPageId): SheetContent => (page ? { kind: "settings", page } : { kind: "settings" });
const kinds = (s: typeof initialSheetState) => s.stack.map((e) => e.kind);

describe("Ajustes como telas: pilha", () => {
  it("raiz e página empilham como duas telas; a mesma página no topo não duplica", () => {
    const root1 = sheetReducer(initialSheetState, push(settings()));
    const withName = sheetReducer(root1, push(settings("name")));
    expect(kinds(withName)).toEqual(["home", "settings", "settings"]);
    expect(sheetReducer(withName, push(settings("name"))).stack).toHaveLength(3);
  });

  it("páginas diferentes coexistem", () => {
    const s = [settings(), settings("name"), settings("margin")].reduce(
      (acc, sheet) => sheetReducer(acc, push(sheet)),
      initialSheetState,
    );
    expect(s.stack).toHaveLength(4);
  });
});

describe("Ajustes como telas: títulos", () => {
  it("cada id devolve a chave certa", () => {
    expect(settingsPageTitle("root")).toBe("settings.title");
    expect(settingsPageTitle("name")).toBe("settings.name.title");
    expect(settingsPageTitle("margin")).toBe("settings.margin.title");
    expect(settingsPageTitle("days")).toBe("settings.days.row");
    expect(settingsPageTitle("holidays")).toBe("settings.holidays.row");
    expect(settingsPageTitle("map")).toBe("settings.offline_map.title");
    expect(settingsPageTitle("backup")).toBe("settings.data.backup_row");
    expect(settingsPageTitle("about")).toBe("settings.about.title");
    expect(settingsPageTitle("network_import")).toBe("settings.network_import");
  });
});

describe("Ajustes como telas: ligação", () => {
  const sheet = read("sheets/SettingsSheet.tsx");

  it.each(["name", "margin", "days", "holidays", "map", "backup", "about", "network_import"])(
    "a linha de %s empurra settings com a page certa",
    (page) => {
      expect(sheet).toContain(`dispatch({ type: "push", sheet: { kind: "settings", page: "${page}" } })`);
    },
  );

  it("Importar rede nova só abre a página depois de escolher o arquivo", () => {
    expect(sheet).toMatch(
      /if \(picked\) dispatch\(\{ type: "push", sheet: \{ kind: "settings", page: "network_import" \} \}\)/,
    );
  });

  it("o SheetHost passa a page da entrada", () => {
    expect(read("sheets/SheetHost.tsx")).toContain("<SettingsSheet id={entry.id} page={entry.page} />");
  });

  it("o SettingsSheet não tem mais navegação interna nem botão Ajustes", () => {
    for (const gone of ["useReducer", "dispatchNav", "SettingsNavContext", "settings.back.a11y"]) {
      expect(sheet).not.toContain(gone);
    }
  });

  it("SettingsHandle não esconde o botão", () => {
    const handle = sheet.slice(sheet.indexOf("function SettingsHandle"), sheet.indexOf("const DETENTS"));
    expect(handle).toContain("<SheetHandle");
    expect(handle).not.toContain("hideCloseButton");
  });
});
