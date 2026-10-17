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

describe("E-09 Bloco 34 guardas de ligação (e09Bloco34Wiring)", () => {
  describe("Item 1 · teclado não abre sozinho em Meu nome", () => {
    it("nenhum TextInput de SettingsSheet tem autoFocus", () => {
      const { sf, found } = jsxOf("sheets/SettingsSheet.tsx", ["BottomSheetTextInput", "TextInput"]);
      expect(found.length).toBeGreaterThan(0);
      const comAutoFocus = found.filter((n) => attrText(n, "autoFocus", sf) !== null).map((n) => n.getText(sf).slice(0, 60));
      expect(comAutoFocus).toEqual([]);
    });
  });

  describe("Item 2 · cartão Para conferir abre a folha", () => {
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

    it("a raiz de PendingCardView é um Pressable", () => {
      expect(root && jsxName(root, sf)).toBe("Pressable");
    });
    it("a raiz chama onCheck(row) no onPress", () => {
      expect(root && attrText(root, "onPress", sf)?.replace(/\s+/g, "")).toBe("()=>onCheck(row)");
    });
    it("a raiz mantém pendingCardContainer e leva pressedStyle", () => {
      const style = root ? (attrText(root, "style", sf) ?? "") : "";
      expect(style).toContain("styles.pendingCardContainer");
      expect(style).toContain("pressedStyle(pressed)");
    });
  });

  describe("Item 3 · botões do cartão proporcionais", () => {
    for (const key of ["pendingButtonCheck", "pendingButtonUnsure"]) {
      it(`${key}: sem flex, altura visual menor que ${minTouch} e toque (altura + hitSlop) >= ${minTouch}`, () => {
        const c = controlsOf("sheets/RecordsSheet.tsx", key);
        expect(c).toHaveLength(1);
        expect(c[0]!.flex).toBeUndefined();
        expect(c[0]!.visual).toBeLessThan(minTouch);
        expect(c[0]!.hasHitSlop).toBe(true);
        expect(c[0]!.touch).toBeGreaterThanOrEqual(minTouch);
      });
    }
    it("os dois botões lado a lado não sobrepõem hitSlop (folga somada <= gap)", () => {
      const a = controlsOf("sheets/RecordsSheet.tsx", "pendingButtonCheck")[0]!;
      const b = controlsOf("sheets/RecordsSheet.tsx", "pendingButtonUnsure")[0]!;
      const gap = styleOf(parse("sheets/RecordsSheet.tsx"), "pendingCardActions").gap as number;
      expect(a.slop.right + b.slop.left).toBeLessThanOrEqual(gap);
    });
  });

  describe("Item 4 · toque até 44 pt (altura visual + hitSlop vertical)", () => {
    const casos: [string, string, number][] = [
      ["sheets/OptionSheet.tsx", "rangeToggleBtn", 2],
      ["sheets/OptionSheet.tsx", "stepperBtnSmall", 4],
      ["ui/Chip.tsx", "chip", 1],
    ];
    for (const [rel, key, n] of casos) {
      it(`${rel} · ${key}: ${n} controle(s) chegam a ${minTouch} pt`, () => {
        const c = controlsOf(rel, key);
        expect(c).toHaveLength(n);
        for (const x of c) expect(x.touch).toBeGreaterThanOrEqual(minTouch);
      });
    }
    it("ui/TripCard.tsx · cabeça do cartão tem hitSlop vertical (altura do conteúdo ~37, estimada)", () => {
      const c = controlsOf("ui/TripCard.tsx", "head");
      expect(c).toHaveLength(1);
      expect(c[0]!.slop.top + c[0]!.slop.bottom).toBeGreaterThanOrEqual(8);
    });
  });
});
