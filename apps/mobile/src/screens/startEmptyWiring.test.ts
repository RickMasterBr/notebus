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

describe("lacunas L3 a L6 (abertura e primeiro uso)", () => {
  const app = read("..", "..", "App.tsx");
  const firstRun = read("FirstRun.tsx");

  it("(L3) o caminho da abertura em App.tsx chama ensureUserNetwork com .catch antes de setPhase('list')", () => {
    const openPath = between(app, 'if (await needsFirstRun(opened)) return setPhase("first_run");', "}, []);");
    expect(
      openPath,
      "L3: ensureUserNetwork com .catch antes de setPhase('list')",
    ).toContain(
      'await ensureUserNetwork(opened).catch((error) => console.warn("ensureUserNetwork falhou", error)); setPhase("list");',
    );
  });

  it("(L4) onStartEmpty em App.tsx contém try/catch com return 'failed' antes de setPhase('list') e return 'done'", () => {
    const onStartEmpty = between(app, "onStartEmpty={", "/>");
    expect(
      onStartEmpty,
      "L4: try { await startEmpty(db); } catch { return 'failed'; } setPhase('list'); return 'done';",
    ).toContain(
      'try { await startEmpty(db); } catch { return "failed"; } setPhase("list"); return "done";',
    );
  });

  it("(L5) em FirstRun.tsx, startEmpty fecha contígua com trava e cartão Começar do zero tem accessibilityState busy", () => {
    expect(
      firstRun,
      "L5: função startEmpty contígua com trava e setStartFailed",
    ).toContain(
      'async function startEmpty() { if (starting) return; setStartFailed(false); setStarting(true); const result = await onStartEmpty(); if (result === "failed") { setStarting(false); setStartFailed(true); } }',
    );
    const cardIdx = firstRun.indexOf("onPress={startEmpty}");
    expect(cardIdx, "L5: onPress={startEmpty} não achado").toBeGreaterThan(-1);
    const cardHeader = firstRun.substring(
      firstRun.lastIndexOf("<Pressable", cardIdx),
      firstRun.indexOf(">", cardIdx) + 1,
    );
    expect(
      cardHeader,
      "L5: Pressable do startEmpty tem accessibilityState={{ busy: starting }} no mesmo elemento",
    ).toContain("accessibilityState={{ busy: starting }}");
  });

  it("(L6) em FirstRun.tsx, no cartão Começar do zero, {startFailed ? ( abre o Text com t('first_run.start_failed')", () => {
    const card = between(firstRun, "onPress={startEmpty}", "</Pressable>");
    expect(
      card,
      "L6: {startFailed ? ( abre Text com t('first_run.start_failed')",
    ).toContain(
      '{startFailed ? ( <Text accessibilityLiveRegion="polite" style={[type.caption, { color: colors.danger }]}> {t("first_run.start_failed")}',
    );
  });
});

