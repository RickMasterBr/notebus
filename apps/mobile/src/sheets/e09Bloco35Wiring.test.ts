/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { minTouch, radius, space } from "../theme/tokens";
import { hitSlopToMinTouch } from "../ui/touch";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

function parse(rel: string) {
  const code = readFileSync(join(root, rel), "utf8");
  return ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

function jsxName(n: ts.Node, sf: ts.SourceFile): string | null {
  if (ts.isJsxElement(n)) return n.openingElement.tagName.getText(sf);
  if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText(sf);
  return null;
}

function attrsOf(n: ts.Node): ts.JsxAttribute[] {
  const props = ts.isJsxElement(n) ? n.openingElement.attributes.properties : (n as ts.JsxSelfClosingElement).attributes.properties;
  return props.filter(ts.isJsxAttribute);
}

function attrText(n: ts.Node, name: string, sf: ts.SourceFile): string | null {
  const a = attrsOf(n).find((x) => x.name.getText(sf) === name);
  if (!a) return null;
  const init = a.initializer;
  if (!init) return "true";
  return ts.isJsxExpression(init) ? (init.expression?.getText(sf) ?? "") : init.getText(sf);
}

function jsxOf(rel: string, tag: string[]) {
  const sf = parse(rel);
  const found: ts.Node[] = [];
  walk(sf, (n) => {
    const name = jsxName(n, sf);
    if (name && tag.includes(name)) found.push(n);
  });
  return { sf, found };
}

/** Objeto de `styles.<key>` dentro de `StyleSheet.create`, avaliado com os tokens do tema. */
function styleOf(sf: ts.SourceFile, key: string): Record<string, unknown> {
  let text: string | null = null;
  walk(sf, (n) => {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === key && ts.isObjectLiteralExpression(n.initializer)) {
      const parent = n.parent.parent;
      if (ts.isCallExpression(parent) && parent.expression.getText(sf).endsWith("StyleSheet.create")) text = n.initializer.getText(sf);
    }
  });
  if (text === null) throw new Error(`estilo ${key} não encontrado em ${sf.fileName}`);
  return new Function("minTouch", "space", "radius", `return (${text})`)(minTouch, space, radius);
}

function evalSlop(expr: string | null) {
  if (expr === null) return { top: 0, bottom: 0, left: 0, right: 0 };
  const v = new Function("hitSlopToMinTouch", "space", `return (${expr})`)(hitSlopToMinTouch, space);
  return { top: 0, bottom: 0, left: 0, right: 0, ...v } as { top: number; bottom: number; left: number; right: number };
}

/** Pressables cujo `style` usa `styles.<key>`: altura visual + hitSlop vertical. */
function controlsOf(rel: string, key: string) {
  const { sf, found } = jsxOf(rel, ["Pressable"]);
  return found
    .filter((n) => new RegExp(`styles\\.${key}\\b`).test(attrText(n, "style", sf) ?? ""))
    .map((n) => {
      const st = styleOf(sf, key);
      const visual = (st.height ?? st.minHeight) as number;
      const slop = evalSlop(attrText(n, "hitSlop", sf));
      return { visual, slop, flex: st.flex, touch: visual + slop.top + slop.bottom, hasHitSlop: attrText(n, "hitSlop", sf) !== null };
    });
}

describe("E-09 Bloco 35 guardas de ligação (e09Bloco35Wiring)", () => {
  describe("Item 1 · ação Não sei no cartão Para conferir (VoiceOver)", () => {
    const sf = parse("sheets/RecordsSheet.tsx");
    let root: ts.Node | null = null;
    walk(sf, (n) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "PendingCardView") {
        walk(n, (m) => {
          if (root === null && ts.isReturnStatement(m) && m.expression) {
            let e: ts.Node = m.expression;
            while (ts.isParenthesizedExpression(e)) e = e.expression;
            root = e;
          }
        });
      }
    });
    const squash = (s: string | null) => (s ?? "").replace(/\s+/g, "");

    it("a raiz tem accessibilityActions com label vindo de t(\"sheet_records.pending.unsure\")", () => {
      const a = root ? attrText(root, "accessibilityActions", sf) : null;
      expect(squash(a)).toBe('[{name:"dismiss",label:t("sheet_records.pending.unsure")}]');
    });
    it("a raiz tem onAccessibilityAction que lê actionName na primeira linha e chama onDismiss(row)", () => {
      const h = root ? attrText(root, "onAccessibilityAction", sf) : null;
      expect(h).not.toBeNull();
      const fn = /\{\s*const action = e\.nativeEvent\.actionName;/;
      expect(fn.test(h!)).toBe(true);
      expect(squash(h)).toContain('if(action==="dismiss")onDismiss(row);');
      expect(squash(h)).not.toContain("onCheck(row)");
    });
    it("nenhum nativeEvent dentro de função passada a set...(", () => {
      const ruins: string[] = [];
      walk(sf, (n) => {
        if (ts.isCallExpression(n) && /^set[A-Z]/.test(n.expression.getText(sf))) {
          for (const arg of n.arguments) {
            if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && arg.getText(sf).includes("nativeEvent")) ruins.push(n.getText(sf).slice(0, 60));
          }
        }
      });
      expect(ruins).toEqual([]);
    });
  });

  describe("Item 2 · passos pequenos do OptionSheet chegam a 44 pt na largura também", () => {
    it(`4 controles: altura e largura (visual + hitSlop) >= ${minTouch}`, () => {
      const { sf, found } = jsxOf("sheets/OptionSheet.tsx", ["Pressable"]);
      const st = styleOf(sf, "stepperBtnSmall");
      const c = found
        .filter((n) => /styles\.stepperBtnSmall\b/.test(attrText(n, "style", sf) ?? ""))
        .map((n) => ({ slop: evalSlop(attrText(n, "hitSlop", sf)) }));
      expect(c).toHaveLength(4);
      for (const { slop } of c) {
        expect((st.height as number) + slop.top + slop.bottom).toBeGreaterThanOrEqual(minTouch);
        expect((st.width as number) + slop.left + slop.right).toBeGreaterThanOrEqual(minTouch);
      }
    });
  });
});
