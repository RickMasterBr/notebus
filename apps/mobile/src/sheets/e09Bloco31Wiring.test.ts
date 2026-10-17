/** E-09 bloco 31: guarda de ligação. Lê o efeito de revelação pela árvore do TypeScript (comentários e espaços não contam). */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const file = new URL("./StackedSheet.tsx", import.meta.url);
const source = ts.createSourceFile("StackedSheet.tsx", readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const calls: { name: string; node: ts.CallExpression }[] = [];
const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push({ name: node.expression.text, node });
  ts.forEachChild(node, visit);
};
visit(source);
const text = (n: ts.Node) => n.getText(source).replace(/\s+/g, " ");

describe("E-09 bloco 31: o efeito de revelação passa o motivo ao repairStep", () => {
  it("chama ghostReason e não chama isGhostSuspect", () => {
    expect(calls.some((c) => c.name === "ghostReason")).toBe(true);
    expect(calls.some((c) => c.name === "isGhostSuspect")).toBe(false);
  });
  it('repairStep recebe o motivo como 2º argumento: reason ?? "posicao"', () => {
    const repair = calls.filter((c) => c.name === "repairStep");
    expect(repair).toHaveLength(1);
    expect(repair[0]!.node.arguments.map(text)).toEqual(["attempt", 'reason ?? "posicao"']);
  });
});
