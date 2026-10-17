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

/** Linhas (1-based) dos botões `<Pressable onPress>` cujo `style` não é uma função de seta que chama `pressedStyle(`. Comentários não contam: a varredura é pela árvore. */
export function pressablesWithoutFeedbackLines(file: string, code = readFileSync(file, "utf-8")): number[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "Pressable") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const attr = (name: string) => attrs.find((a) => a.name.getText(sf) === name);
      if (attr("onPress")) {
        const expr = attr("style")?.initializer;
        const fn = expr && ts.isJsxExpression(expr) ? expr.expression : undefined;
        if (!(fn && ts.isArrowFunction(fn) && hasPressedStyleCall(fn.body))) {
          lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

export const pressablesWithoutFeedback = (file: string, code?: string) => pressablesWithoutFeedbackLines(file, code).length;

const rel = (file: string) => relative(SRC, file).replace(/\\/g, "/");

/** Exceções: cortina ou Pressable que já envolve componente com feedback próprio. Cada uma com motivo; a quantidade também é conferida. */
export const EXEMPT: { file: string; count: number; reason: string }[] = [
  { file: "ui/NbSwitch.tsx", count: 1, reason: "interruptor tem animação própria (trilho e botão)" },
  { file: "ui/RegisterButton.tsx", count: 1, reason: "feedback próprio especificado: encolhe para 96% (4.5 §2.5)" },
  { file: "ui/PickerModal.tsx", count: 1, reason: "cortina: fundo invisível que só fecha a folha" },
  { file: "sheets/HolidaySheet.tsx", count: 2, reason: "cortina do seletor de data (fecha ao tocar fora) e caixa que só barra o toque (stopPropagation)" },
  { file: "sheets/RepeatSheet.tsx", count: 2, reason: "cortina do seletor de data (fecha ao tocar fora) e caixa que só barra o toque (stopPropagation)" },
  { file: "sheets/SheetHandle.tsx", count: 1, reason: "handle de arrastar que também fecha ao toque; não é botão (o ✕ é o botão)" },
  { file: "sheets/diagScroll.tsx", count: 1, reason: "peça do diagnóstico [DIAG], não é botão do produto" },
];

describe("Feedback de toque em todo botão", () => {
  const exempt = new Map(EXEMPT.map((e) => [e.file, e.count]));
  const measured = new Map(
    tsxFiles(SRC)
      .map((f) => [rel(f), pressablesWithoutFeedbackLines(f)] as const)
      .filter(([, lines]) => lines.length > 0),
  );

  it("todo <Pressable onPress> tem pressedStyle, fora de EXEMPT", () => {
    const bad = [...measured]
      .filter(([f, lines]) => lines.length !== (exempt.get(f) ?? 0))
      .map(([f, lines]) => `${f}: linha(s) ${lines.join(", ")} sem pressedStyle (${lines.length} botão(ões), EXEMPT permite ${exempt.get(f) ?? 0})`);
    expect(bad).toEqual([]);
  });

  it("a quantidade de cada EXEMPT bate com o arquivo", () => {
    const bad = EXEMPT.filter((e) => (measured.get(e.file)?.length ?? 0) !== e.count).map(
      (e) => `${e.file}: EXEMPT diz ${e.count}, o arquivo tem ${measured.get(e.file)?.length ?? 0}`,
    );
    expect(bad).toEqual([]);
  });
});
