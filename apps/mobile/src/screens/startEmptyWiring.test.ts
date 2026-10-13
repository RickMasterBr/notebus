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
});
