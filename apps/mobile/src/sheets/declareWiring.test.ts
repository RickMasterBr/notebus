/// <reference types="node" />
/**
 * Guardas de ligação da folha "Declarar horário" (TL-07, E-08 bloco 2, item 5).
 * GUARDA DE TEXTO: confere o código-fonte **sem comentários** e o uso exato (qual valor vai em qual prop), não a tela montada.
 * Quem prova toque, rolagem e VoiceOver é o iPhone `[hipótese, só o aparelho decide]`.
 *
 * `NB_WIRING_ROOT` aponta para outra cópia da pasta `src/` (o clone descartável onde se aplica a mutação do guarda);
 * `App.tsx` é lido ao lado dela (`<raiz>/../App.tsx`). Sem a variável, lê o código de verdade.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

/** Texto-fonte sem comentários de bloco, de linha e de JSX (um comentário não pode fazer o guarda passar). */
const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const declareSheet = read("sheets/DeclareSheet.tsx");
const stopSheet = read("sheets/StopSheet.tsx");
const sheetHost = read("sheets/SheetHost.tsx");
const app = read("../App.tsx");
const stopCard = read("data/stopCard.ts");

/** O corpo de `handleSave`, do início até o fim da função. */
const saveBody = () => {
  const start = declareSheet.indexOf("const handleSave = async () => {");
  expect(start).toBeGreaterThan(-1);
  const end = declareSheet.indexOf("const timeText", start);
  expect(end).toBeGreaterThan(start);
  return declareSheet.slice(start, end);
};

describe("DeclareSheet: o que a folha consome do plano (declareView)", () => {
  it("o Salvar fica desabilitado por view.canSave", () => {
    expect(declareSheet).toContain("const canSave = view?.canSave === true;");
    expect(declareSheet).toContain("disabled={!canSave}");
    expect(declareSheet).toContain("accessibilityState={{ disabled: !canSave }}");
  });

  it("view.showPassage decide o bloco dos chips da passagem, e só ele", () => {
    expect(declareSheet).toMatch(
      /\{view\.showPassage \? \(\s*<View style=\{styles\.section\}>[\s\S]*?\{view\.passageOptions\.map\(\(option\) => \(\s*<Chip[\s\S]*?\) : null\}/,
    );
    expect(declareSheet.match(/view\.showPassage/g)).toHaveLength(1);
  });

  it("view.showNightHint decide o texto da madrugada e view.showPartialHint o do 'vale só neste ponto'", () => {
    expect(declareSheet).toMatch(/\{view\.showNightHint \? \(\s*<Text[^>]*>\{t\("declare\.night_hint"\)\}<\/Text>\s*\) : null\}/);
    expect(declareSheet).toMatch(/\{view\?\.showPartialHint \? \(\s*<Text[^>]*>\{t\("declare\.partial_hint"\)\}<\/Text>\s*\) : null\}/);
  });

  it("os tipos de dia e a linha escolhida alimentam o plano", () => {
    expect(declareSheet).toContain("buildDeclareView(stopId, data, { lineCode, hour, passage, dayTypes })");
    expect(declareSheet).toContain("onPress={() => toggleDayType(day.code)}");
  });
});

describe("DeclareSheet: Salvar", () => {
  it("o toque no Salvar chama handleSave", () => {
    expect(declareSheet).toContain("onPress={() => void handleSave()}");
  });

  it("createSubmitGuard.run envolve a gravação (duplo toque)", () => {
    expect(declareSheet).toContain("const submitGuard = useRef(createSubmitGuard()).current;");
    const body = saveBody();
    const guardAt = body.indexOf("await submitGuard.run(async () => {");
    expect(guardAt).toBeGreaterThan(-1);
    expect(body.indexOf("declared.declare(", guardAt)).toBeGreaterThan(guardAt);
  });

  it("grava o plano da folha: declared.declare(plan, now()), com o plano de view.plan", () => {
    const body = saveBody();
    expect(body).toContain("const plan = view?.plan;");
    expect(body).toContain("if (!plan) return;");
    expect(body).toContain("const result = await declared.declare(plan, now());");
  });

  it("o Desfazer do toast chama o undo que a gravação devolveu", () => {
    const body = saveBody();
    expect(body).toMatch(/label: t\("toast\.action\.undo"\),\s*run: async \(\) => \{\s*const undone = await result\.undo\(now\(\)\);/);
  });

  it("o toast de sucesso é o texto do plano gravado", () => {
    expect(saveBody()).toContain("title: declareToast(result.steps),");
  });

  it("a folha só fecha no ok: close() uma vez, dentro do ramo de sucesso", () => {
    const body = saveBody();
    const [beforeOk, afterOk] = body.split("if (result.ok) {") as [string, string];
    expect(afterOk).toBeDefined();
    expect(beforeOk).not.toContain("close()");
    const [okBranch, elseBranch] = afterOk.split("} else {") as [string, string];
    expect(okBranch).toContain("close();");
    expect(elseBranch).toBeDefined();
    expect(elseBranch).not.toContain("close()");
    expect(body.match(/close\(\)/g)).toHaveLength(1);
  });

  it("a recusa mostra o toast de erro do app", () => {
    const elseBranch = saveBody().split("} else {")[1]!;
    expect(elseBranch).toContain('kind: "error"');
    expect(elseBranch).toContain('result.reason === "stale" ? t("declare.error.stale") : t("declare.error.generic")');
  });
});

describe("StopSheet: o botão 'Declarar horário'", () => {
  it("empilha kind 'declare' com o stopId do ponto, só no detent Grande", () => {
    expect(stopSheet).toMatch(
      /\{detent === 2 \? \(\s*<Pressable[\s\S]*?onPress=\{\(\) => dispatch\(\{ type: "push", sheet: \{ kind: "declare", stopId \} \}\)\}[\s\S]*?\{t\("declare\.button"\)\}[\s\S]*?\) : null\}/,
    );
    expect(stopSheet.match(/kind: "declare"/g)).toHaveLength(1);
  });

  it("o selo 'declarado' só aparece quando a passagem tem horário declarado", () => {
    expect(stopSheet).toContain("const declared = declaredKeys.has(passageKeyOf(row.tripId, row.position));");
    expect(stopSheet).toContain("if (!declared) return view;");
    expect(stopSheet).toMatch(/\{view\}\s*<DeclaredSeal \/>/);
    expect(stopSheet).toContain("declaredPassageKeys(schedule.data.trips)");
  });

  it("o domínio do selo: só stop_time com origin declarado entra", () => {
    expect(stopCard).toContain('if (st.origin === "declared") keys.add(passageKeyOf(trip.id, st.position));');
  });
});

describe("SheetHost, App", () => {
  it("SheetHost: case 'declare' renderiza DeclareSheet com o stopId", () => {
    expect(sheetHost).toMatch(/case "declare":\s*return <DeclareSheet id=\{entry\.id\} stopId=\{entry\.stopId\} \/>;/);
  });

  it("App: o DeclaredTimesProvider está dentro dos provedores de que depende e envolve o Início", () => {
    const at = (tag: string) => {
      const i = app.indexOf(tag);
      expect(i, tag).toBeGreaterThan(-1);
      return i;
    };
    const open = at("<DeclaredTimesProvider db={db}>");
    expect(at("<ScheduleProvider")).toBeLessThan(open);
    expect(at("<RegistroProvider db={db}>")).toBeLessThan(open);
    expect(at("<CalendarEditsProvider db={db}>")).toBeLessThan(open);
    const homeMatch = app.match(/<OfflineMapProvider[^>]*>\s*<Home key=\{[^}]+\} \/>\s*<\/OfflineMapProvider>/);
    expect(homeMatch).not.toBeNull();
    const homeIndex = homeMatch!.index!;
    expect(homeIndex).toBeGreaterThan(open);
    const close = at("</DeclaredTimesProvider>");
    expect(close).toBeGreaterThan(homeIndex);
    expect(close).toBeLessThan(at("</RegistroProvider>"));
    expect(close).toBeLessThan(at("</ScheduleProvider>"));
  });
});
