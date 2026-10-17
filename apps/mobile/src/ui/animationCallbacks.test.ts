import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Índice (0-based) do argumento de callback de cada animação do Reanimated.
const CALLBACK_ARG: Record<string, number> = { withTiming: 2, withSpring: 2, withDecay: 1, withRepeat: 3 };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

/** O plugin do Babel do worklets só transforma função literal passada direto: ternário, &&, identificador ou chamada viram função JS e derrubam a thread de UI. */
export function badCallbacks(path: string, text: string): string[] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const bad: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const index = CALLBACK_ARG[node.expression.text];
      const arg = index === undefined ? undefined : node.arguments[index];
      if (arg && !ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) {
        const line = sf.getLineAndCharacterOfPosition(arg.getStart()).line + 1;
        bad.push(`${path}:${line} ${node.expression.text} com callback que não é função literal`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bad;
}

describe("callbacks de animação são funções literais (E-09 bloco 30)", () => {
  it("nenhum withTiming/withSpring/withDecay/withRepeat recebe callback que não seja arrow ou function", () => {
    const bad = sourceFiles(join(__dirname, "..")).flatMap((p) => badCallbacks(p, readFileSync(p, "utf-8")));
    expect(bad).toEqual([]);
  });

  it("o detector reprova o ternário do bloco 29", () => {
    const code = "x.value = withTiming(1, { duration: 1 }, diag ? () => runOnJS(f)(diag) : undefined);";
    expect(badCallbacks("x.tsx", code)).toHaveLength(1);
  });

  it("aceita função literal e chamada sem callback", () => {
    expect(badCallbacks("x.tsx", "a = withTiming(1, {}, () => {}); b = withTiming(1, {}); c = withRepeat(w, -1, false, function () {});")).toEqual([]);
  });
});
