import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : tsxFiles(full);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [full] : [];
  });
}

function hasPressedStyleCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "pressedStyle") return true;
  return ts.forEachChild(node, hasPressedStyleCall) ?? false;
}

/** Botões `<Pressable onPress>` cujo `style` não é uma função de seta que chama `pressedStyle(`. Comentários não contam: a varredura é pela árvore. */
export function pressablesWithoutFeedback(file: string, code = readFileSync(file, "utf-8")): number {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let missing = 0;
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "Pressable") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const attr = (name: string) => attrs.find((a) => a.name.getText(sf) === name);
      if (attr("onPress")) {
        const expr = attr("style")?.initializer;
        const fn = expr && ts.isJsxExpression(expr) ? expr.expression : undefined;
        if (!(fn && ts.isArrowFunction(fn) && hasPressedStyleCall(fn.body))) missing += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return missing;
}

const rel = (file: string) => relative(SRC, file).replace(/\\/g, "/");

/** Exceções do bloco 32: cortina ou Pressable que já envolve componente com feedback próprio. Cada uma com motivo. */
export const EXEMPT: { file: string; count: number; reason: string }[] = [
  { file: "ui/NbSwitch.tsx", count: 1, reason: "interruptor tem animação própria (trilho e botão)" },
  { file: "ui/RegisterButton.tsx", count: 1, reason: "feedback próprio especificado: encolhe para 96% (4.5 §2.5)" },
  { file: "ui/PickerModal.tsx", count: 1, reason: "cortina: fundo invisível que só fecha a folha" },
];

/** Arquivos que o bloco 33 ainda cobre, com a quantidade de botões sem feedback (medição do bloco 32). Só pode descer; zero sai da lista. */
export const PENDING_BLOCO_33: Record<string, number> = {
  "sheets/AboutPage.tsx": 1,
  "sheets/AheadSheet.tsx": 1,
  "sheets/AlarmIntroSheet.tsx": 4,
  "sheets/AlarmsSheet.tsx": 3,
  "sheets/AlightPickerSheet.tsx": 1,
  "sheets/AlightSheet.tsx": 1,
  "sheets/BackupImportSheet.tsx": 2,
  "sheets/BoardSheet.tsx": 2,
  "sheets/ClockPickerSheet.tsx": 1,
  "sheets/DeclareSheet.tsx": 3,
  "sheets/diagScroll.tsx": 1,
  "sheets/HolidaySheet.tsx": 5,
  "sheets/LineDetailSheet.tsx": 1,
  "sheets/LineEditSheet.tsx": 9,
  "sheets/MarginStepper.tsx": 2,
  "sheets/NetworkSheet.tsx": 9,
  "sheets/OverrideSheet.tsx": 2,
  "sheets/PastOverridesSheet.tsx": 1,
  "sheets/PlaceSheet.tsx": 9,
  "sheets/PlacesSheet.tsx": 3,
  "sheets/RecordsSheet.tsx": 6,
  "sheets/RepeatSheet.tsx": 8,
  "sheets/RouteSheet.tsx": 3,
  "sheets/SearchSheet.tsx": 2,
  "sheets/SettingsSheet.tsx": 6,
  "sheets/SheetHandle.tsx": 1,
  "sheets/StopEditSheet.tsx": 4,
  "sheets/StopLocationOffer.tsx": 2,
  "sheets/StopMapPick.tsx": 1,
  "sheets/StopSheet.tsx": 3,
  "sheets/VerifySheet.tsx": 4,
};

describe("Feedback de toque em todo botão (bloco 32 e 33)", () => {
  const exempt = new Map(EXEMPT.map((e) => [e.file, e.count]));
  const measured = new Map(
    tsxFiles(SRC)
      .map((f) => [rel(f), pressablesWithoutFeedback(f)] as const)
      .filter(([, n]) => n > 0),
  );

  it("arquivo fora da lista não tem botão sem pressedStyle", () => {
    const bad = [...measured]
      .filter(([f, n]) => !(f in PENDING_BLOCO_33) && n !== (exempt.get(f) ?? 0))
      .map(([f, n]) => `${f}: ${n} botão(ões) sem pressedStyle`);
    expect(bad).toEqual([]);
  });

  it("arquivo da lista PENDING_BLOCO_33 ainda tem botão sem feedback (zero obriga a sair da lista)", () => {
    const bad = Object.keys(PENDING_BLOCO_33)
      .filter((f) => (measured.get(f) ?? 0) - (exempt.get(f) ?? 0) <= 0)
      .map((f) => `${f}: já está coberto, tire da lista PENDING_BLOCO_33`);
    expect(bad).toEqual([]);
  });

  it("a quantidade de um arquivo da lista PENDING_BLOCO_33 não aumenta", () => {
    const bad = Object.entries(PENDING_BLOCO_33)
      .filter(([f, n]) => (measured.get(f) ?? 0) > n)
      .map(([f, n]) => `${f}: ${measured.get(f)} botões sem feedback, a lista diz ${n}`);
    expect(bad).toEqual([]);
  });
});
