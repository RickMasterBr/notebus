import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** O texto sem comentários e com espaços normalizados, para comparar trechos exatos. */
const normalized = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

const read = (...path: string[]) => normalized(readFileSync(join(__dirname, ...path), "utf8"));

/** O trecho de `start` até `end` (a primeira vez que aparece depois), ou "" se algum não existe. */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from === -1) return "";
  const to = text.indexOf(end, from);
  return to === -1 ? "" : text.slice(from, to);
}

export function checkAppStartEmptyWiring(app: string): {
  startEmptyBeforeList: boolean;
  startEmptyNotJustMark: boolean;
  ensureOnOpenPath: boolean;
} {
  const onStartEmpty = between(app, "onStartEmpty={", "/>");
  const openPath = between(app, 'if (await needsFirstRun(opened)) return setPhase("first_run");', "}, []);");
  return {
    startEmptyBeforeList: onStartEmpty.includes("startEmpty(db") && onStartEmpty.indexOf("startEmpty(db") < onStartEmpty.indexOf('setPhase("list")'),
    startEmptyNotJustMark: onStartEmpty !== "" && !onStartEmpty.includes("markFirstRunDone(db)"),
    ensureOnOpenPath: openPath.includes("ensureUserNetwork(opened") && openPath.indexOf("ensureUserNetwork(opened") < openPath.indexOf('setPhase("list")'),
  };
}

export function checkFirstRunStartError(firstRun: string): boolean {
  const card = between(firstRun, "onPress={startEmpty}", "</Pressable>");
  const failedBranch = between(card, "{startFailed ?", ") : null}");
  return failedBranch.includes('t("first_run.start_failed")');
}

export function checkEmptyHomeAction(emptyHome: string): { opensNewStop: boolean; noSearch: boolean } {
  const action = between(emptyHome, 'accessibilityLabel={t("home.empty.action")}', "</Pressable>");
  const onPress = between(action, "onPress=", "style=");
  return {
    opensNewStop: onPress.includes('kind: "stopEdit"') && onPress.includes("stopId: NEW_STOP_ID"),
    noSearch: !emptyHome.includes('kind: "search"'),
  };
}

export function checkRememberNewStop(sheet: string): boolean {
  const branch = between(sheet, "if (result.ok) {", '} else if (result.reason === "no_network")');
  const toastAt = branch.indexOf("toast.show(");
  const rememberAt = branch.indexOf("remember(result.id)");
  return toastAt !== -1 && rememberAt > toastAt && /isNew && [^;]*remember\(result\.id\)/.test(branch);
}

describe("startEmptyWiring (D-201)", () => {
  it("App.tsx: Começar do zero chama startEmpty antes de abrir a lista, e a abertura conserta a rede", () => {
    expect(checkAppStartEmptyWiring(read("..", "..", "App.tsx"))).toEqual({
      startEmptyBeforeList: true,
      startEmptyNotJustMark: true,
      ensureOnOpenPath: true,
    });
  });

  it("o código anterior (só markFirstRunDone, sem ensureUserNetwork) é reprovado", () => {
    const previous = normalized(`
      setPhase((await needsFirstRun(opened)) ? "first_run" : "list");
      }, []);
      <FirstRun onStartEmpty={async () => { await markFirstRunDone(db); setPhase("list"); }} />`);
    expect(checkAppStartEmptyWiring(previous)).toEqual({
      startEmptyBeforeList: false,
      startEmptyNotJustMark: false,
      ensureOnOpenPath: false,
    });
  });

  it("FirstRun.tsx: o cartão Começar do zero mostra first_run.start_failed no ramo do erro", () => {
    expect(checkFirstRunStartError(read("FirstRun.tsx"))).toBe(true);
  });

  it("FirstRun.tsx: sem o texto de erro no cartão, é reprovado", () => {
    expect(checkFirstRunStartError(normalized('<Pressable onPress={startEmpty}> <Text>{t("first_run.start_empty")}</Text> </Pressable>'))).toBe(false);
  });

  it("EmptyHome.tsx: Cadastrar meu ponto abre o Novo ponto, não a Busca", () => {
    expect(checkEmptyHomeAction(read("EmptyHome.tsx"))).toEqual({ opensNewStop: true, noSearch: true });
  });

  it("EmptyHome.tsx: o código anterior (push search) é reprovado", () => {
    const previous = normalized(`<Pressable accessibilityLabel={t("home.empty.action")} onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })} style={x}></Pressable>`);
    expect(checkEmptyHomeAction(previous)).toEqual({ opensNewStop: false, noSearch: false });
  });

  it("StopEditSheet.tsx: remember(result.id) está no ramo isNew do sucesso, depois do toast do sucesso", () => {
    expect(checkRememberNewStop(read("..", "sheets", "StopEditSheet.tsx"))).toBe(true);
  });

  it("StopEditSheet.tsx: remember fora do isNew ou sem remember é reprovado", () => {
    const wide = normalized("if (result.ok) { toast.show({}); remember(result.id); } else if (result.reason === \"no_network\") {");
    const none = normalized("if (result.ok) { toast.show({}); } else if (result.reason === \"no_network\") {");
    expect(checkRememberNewStop(wide)).toBe(false);
    expect(checkRememberNewStop(none)).toBe(false);
  });
});
